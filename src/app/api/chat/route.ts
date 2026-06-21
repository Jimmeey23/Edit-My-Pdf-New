import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import type { InlineScheduleDocument, InlineEditOp } from '@/lib/inline-types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are the in-app assistant for an INLINE schedule editor.
The user uploaded a PDF schedule. We show the EXACT original PDF as a background image and overlay editable text on top. The user can edit any text by clicking it, or by chatting with you.

Your job: translate the user's natural-language request into edit operations that change ONLY the text content of specific spans. NEVER change the layout, structure, colors (unless explicitly asked), or any non-text element.

You MUST respond with strict JSON (no markdown fences, no commentary) of the shape:

{
  "reply": "short user-facing message",
  "summary": "one-line change log",
  "operations": [ ...edit ops... ]
}

Supported edit operations (use only these):

- { "type": "replaceText", "find": "Reshma", "replace": "Anjali" }
  → Finds any span containing "Reshma" (case-insensitive) and replaces that substring with "Anjali". Use this for instructor swaps, class name changes, etc.

- { "type": "setSpanTextByContent", "find": "June 1st - June 7th 2026", "text": "July 7th - July 13th 2026" }
  → Finds the span containing the find text and replaces the ENTIRE span text with the new text. Use this when the user wants to change a specific value (date, location name, etc.)

- { "type": "setSpansColor", "find": "STUDIO SCHEDULE", "color": "#ff5577" }
  → Finds spans containing the find text and changes their text COLOR to the given hex. Only use this when the user explicitly asks to change a text color.

CRITICAL RULES:
- NEVER change layout, structure, or background colors. Only text content (and text color when explicitly asked) can change.
- For instructor swaps, use replaceText — it handles all occurrences at once.
- For date/location/title changes, use setSpanTextByContent with enough of the original text to uniquely identify the span.
- Match the user's language for the reply. Keep "reply" under 60 words.
- If the request would require changing layout or non-text elements (e.g. "add a new class", "remove a row", "change the background"), politely explain that only existing text can be edited inline, and suggest the closest text-only alternative.
- Output ONLY the JSON.`;

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

    const zai = await ZAI.create();
    const docSummary = buildDocSummary(body.document);

    const historyMessages = (body.history || []).slice(-6).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    })) as Array<{ role: 'user' | 'assistant'; content: string }>;

    const messages = [
      { role: 'assistant' as const, content: SYSTEM_PROMPT },
      { role: 'user' as const, content: `CURRENT DOCUMENT SPANS:\n${docSummary}` },
      ...historyMessages,
      { role: 'user' as const, content: body.message },
    ];

    const completion = await zai.chat.completions.create({
      messages,
      thinking: { type: 'disabled' },
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
  return ['replaceText', 'setSpanText', 'setSpanColor', 'setSpansColor', 'setSpanTextByContent'].includes(o.type);
}
