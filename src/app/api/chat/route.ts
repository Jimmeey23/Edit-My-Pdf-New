import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { InlineScheduleDocument, InlineEditOp } from '@/lib/inline-types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are the in-app assistant for an INLINE schedule editor.
The user uploaded a PDF schedule. We display the EXACT original PDF as a fixed background image and overlay editable text spans on top at their exact original positions.

CRITICAL ARCHITECTURE — READ CAREFULLY:
1. The background image (PDF render) is COMPLETELY IMMUTABLE. Colored blocks, row highlights, background fills, borders, and graphic elements are permanently baked into it and CANNOT be removed or changed under any circumstances.
2. Only the TEXT SPANS overlaid on top can be modified: text content, text color, visibility, font style.
3. If the user asks to "remove a green highlight", "remove a colored background", "clear the theme color from a row", or anything about background/fill colors — you CANNOT do this. Respond in "reply" that background colors are part of the original PDF image and cannot be changed, and offer to change the TEXT color instead if that helps.
4. NEVER use setSpansColor or setSpanStyle to respond to requests about "highlights" or "background colors" unless the user explicitly says they want to change the TEXT color of letters.

You MUST respond with strict JSON (no markdown fences, no commentary):

{
  "reply": "short user-facing message",
  "summary": "one-line change log",
  "operations": [ ...edit ops... ]
}

OPERATIONS (use only these):

- { "type": "replaceText", "find": "Reshma", "replace": "Anjali" }
  → Replaces ALL occurrences of a substring across every span. Best for name swaps, class name changes throughout the whole document.

- { "type": "setSpanTextByContent", "find": "June 1st - June 7th 2026", "text": "July 7th - July 13th 2026", "page": 0 }
  → Finds the span whose text contains "find" and replaces its ENTIRE text. Use for specific dates, titles, locations. Add "page" (0-indexed) to target a specific page only.

- { "type": "setSpansColor", "find": "STUDIO SCHEDULE", "color": "#ff5577" }
  → Changes the TEXT COLOR of spans whose text contains "find". Use ONLY when user explicitly asks to change text/font color, NOT for background or highlight requests.

- { "type": "removeRowAndShift", "find": "MAT 57 - Reshma", "page": 0 }
  → PREFERRED operation to delete a class or row. Hides ALL spans in that row's vertical band AND automatically shifts every span below it upward so there is NO empty gap left behind. Always use this instead of hideSpansByContent when the user wants to delete a class row or time slot.

- { "type": "hideSpansByContent", "find": "some label", "page": 0 }
  → Hides spans matching the text WITHOUT shifting other spans. Use ONLY for hiding isolated labels or annotations — NOT for removing class rows (use removeRowAndShift instead).

- { "type": "setSpanStyle", "spanId": "p0-s6", "changes": { "size": 14, "bold": true, "italic": false, "color": "#333333" } }
  → Modifies the style of one specific span by its ID. Use only when the user targets a specific span for font size, bold, italic, or text color changes. Use only spanIds from the document summary provided.

TARGETING RULES — very important:
- Use the most SPECIFIC and UNIQUE text possible in "find" to avoid matching the wrong span. E.g. don't use just "5:00 PM" if multiple rows have that time — include the class name too: "5:00 PM Yoga".
- When the user says "the 5pm Sunday class row" or similar, look in the document spans for the exact text of that row to form a precise "find" value.
- If you are unsure which span to target, ask the user for clarification rather than guessing.

OTHER RULES:
- Output ONLY the JSON — no markdown, no explanation outside the JSON.
- Match the user's language in "reply". Keep "reply" under 60 words.
- If no operations are needed (e.g. the request is impossible), return an empty operations array and explain in "reply".`;

interface ChatRequestBody {
  message: string;
  document: InlineScheduleDocument;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  if (start < 0) throw new Error('No JSON in response');
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return JSON.parse(candidate.slice(start, i + 1));
      }
    }
  }
  throw new Error('Unbalanced JSON in response');
}

/** Build a compact textual summary of the document's spans for the LLM context. */
function buildDocSummary(doc: InlineScheduleDocument): string {
  const lines: string[] = [];
  lines.push(`Document has ${doc.pages.length} page(s). Editable text spans:`);
  for (const page of doc.pages) {
    lines.push(`\n=== Page ${page.index + 1} (${page.spans.length} spans) ===`);
    // Only include spans that look like meaningful text (skip tiny fragments)
    for (const span of page.spans) {
      const t = span.text.trim();
      if (t.length < 2) continue;
      // Skip marquee/ticker repeats (they're very long and duplicate)
      if (t.length > 120 && t.includes('•')) continue;
      lines.push(`  [${span.id}] "${t}"`);
    }
  }
  return lines.join('\n');
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChatRequestBody;
    if (!body.message || !body.document) {
      return NextResponse.json({ error: 'message and document are required' }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const docSummary = buildDocSummary(body.document);

    const historyMessages = (body.history || []).slice(-6).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    })) as Array<{ role: 'user' | 'assistant'; content: string }>;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `CURRENT DOCUMENT SPANS:\n${docSummary}` },
      ...historyMessages,
      { role: 'user', content: body.message },
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages,
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    let parsed: { reply?: string; summary?: string; operations?: InlineEditOp[] };
    try {
      parsed = extractJson(raw) as typeof parsed;
    } catch {
      parsed = { reply: raw || "I couldn't process that." };
    }

    if (!Array.isArray(parsed.operations)) parsed.operations = [];
    if (typeof parsed.reply !== 'string') parsed.reply = 'Done.';
    if (typeof parsed.summary !== 'string') parsed.summary = '';

    // Sanitise each op
    parsed.operations = parsed.operations.filter(isValidOp);

    return NextResponse.json(parsed);
  } catch (err: unknown) {
    console.error('Chat error:', err);
    const msg = err instanceof Error ? err.message : 'Chat failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function isValidOp(op: unknown): op is InlineEditOp {
  if (!op || typeof op !== 'object') return false;
  const o = op as Record<string, unknown>;
  if (typeof o.type !== 'string') return false;
  return ['replaceText', 'setSpanText', 'setSpanColor', 'setSpansColor', 'setSpanTextByContent', 'hideSpan', 'hideSpansByContent', 'removeRowAndShift', 'setSpanStyle'].includes(o.type);
}
