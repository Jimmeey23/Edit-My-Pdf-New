import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import type { ScheduleDocument, EditOp, ChatResponse } from '@/lib/schedule-types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are the in-app assistant for a weekly studio schedule editor.
The user is looking at a visual schedule and asking you to edit it via natural-language chat.

Your job:
1. Understand the user's intent.
2. Emit a structured set of edit operations that, when applied to the current schedule, achieve their request.
3. Keep the schedule's overall styling / layout / theme bands intact unless the user explicitly asks to change them.

You MUST respond with strict JSON (no markdown fences, no commentary) of the shape:

{
  "reply": "short user-facing message describing what you changed",
  "summary": "one-line change log entry",
  "operations": [ ...edit ops... ]
}

Supported edit operations (use only these):

- { "type": "set", "path": "studioName|location|dateRange|tagline", "value": string }
- { "type": "patchTheme", "changes": { "accent": "#hex", "background": "#hex", "primaryText": "#hex", "bodyText": "#hex", "cardBg": "#hex", "cardBorder": "#hex", "accentText": "#hex" } }
- { "type": "setBandColor", "level": "BEGINNER|INTERMEDIATE|ADVANCED", "color": "#hex" }
- { "type": "replaceTicker", "bands": [ { "text": "...", "textColor": "#hex", "bgColor": "transparent", "fontSize": 7, "italic": false } ] }
- { "type": "addClass", "dayName": "MONDAY", "time": "7:30 AM", "className": "MAT 57", "instructor": "Reshma", "level": "BEGINNER" }
- { "type": "removeClass", "dayName": "MONDAY", "match": { "time": "7:30 AM" } | { "className": "MAT 57" } }
- { "type": "updateClass", "dayName": "MONDAY", "match": { "time": "7:30 AM" } | { "className": "MAT 57" }, "changes": { "time": "...", "className": "...", "instructor": "...", "level": "..." } }
- { "type": "updateAll", "match": { "instructor": "Reshma" }, "changes": { "instructor": "Anjali" } }
- { "type": "addDay", "dayName": "SUNDAY" }
- { "type": "removeDay", "dayName": "SUNDAY" }
- { "type": "replaceClassLevels", "rows": [ { "level": "BEGINNER", "classes": ["BARRE 57"] } ] }
- { "type": "swapInstructor", "from": "Reshma", "to": "Anjali" }
- { "type": "setFont", "family": "heading|body|display", "value": "Inter, sans-serif" }

Important rules:
- Always preserve the original visual identity: don't change accent / background / fonts unless explicitly asked.
- When the user asks to "change theme" / "use dark theme" / "make it pink", interpret as patchTheme + setBandColor ops.
- When the user asks to swap instructors, prefer swapInstructor over many updateClass ops.
- "match" objects must use one of { time, className, instructor } — pick the most specific one.
- For "level" use BEGINNER / INTERMEDIATE / ADVANCED only.
- Reply in the user's language. Keep "reply" under 60 words.
- Output ONLY the JSON.`;

interface ChatRequestBody {
  message: string;
  document: ScheduleDocument;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

function extractJson(text: string): unknown {
  // Strip markdown fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  // Find the first balanced { ... }
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
      { role: 'user' as const, content: `CURRENT SCHEDULE:\n${docSummary}` },
      ...historyMessages,
      { role: 'user' as const, content: body.message },
    ];

    const completion = await zai.chat.completions.create({
      messages,
      thinking: { type: 'disabled' },
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    let parsed: ChatResponse;
    try {
      parsed = extractJson(raw) as ChatResponse;
    } catch {
      // If JSON parse fails, return the raw text as a friendly reply with no ops
      parsed = { reply: raw || "I couldn't process that.", operations: [] };
    }

    // Defensive: ensure operations is an array
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

function isValidOp(op: unknown): op is EditOp {
  if (!op || typeof op !== 'object') return false;
  const o = op as Record<string, unknown>;
  return typeof o.type === 'string';
}

/** Build a compact textual summary of the schedule for the LLM context. */
function buildDocSummary(doc: ScheduleDocument): string {
  const lines: string[] = [];
  lines.push(`# ${doc.studioName} — ${doc.location}`);
  lines.push(`Date: ${doc.dateRange}`);
  if (doc.tagline) lines.push(`Tagline: ${doc.tagline}`);
  if (doc.tickerBands.length) {
    lines.push(`Ticker bands:`);
    doc.tickerBands.forEach(b => lines.push(`  - "${b.text}" (color ${b.textColor}, size ${b.fontSize})`));
  }
  if (doc.classLevels.length) {
    lines.push(`Class levels:`);
    doc.classLevels.forEach(r => lines.push(`  - ${r.level}: ${r.classes.join(', ')}`));
  }
  lines.push(`Theme:`);
  lines.push(`  accent=${doc.theme.accent} background=${doc.theme.background} primaryText=${doc.theme.primaryText} bodyText=${doc.theme.bodyText} cardBg=${doc.theme.cardBg}`);
  lines.push(`  bandColors: BEGINNER=${doc.theme.bandColors.BEGINNER} INTERMEDIATE=${doc.theme.bandColors.INTERMEDIATE} ADVANCED=${doc.theme.bandColors.ADVANCED}`);
  lines.push(`  fonts: heading=${doc.theme.fontFamilyHeading} body=${doc.theme.fontFamilyBody} display=${doc.theme.fontFamilyDisplay}`);
  lines.push(`Days:`);
  doc.days.forEach(d => {
    lines.push(`  ${d.name}:`);
    d.classes.forEach(c => lines.push(`    ${c.time} | ${c.className} | ${c.instructor} | ${c.level}`));
  });
  return lines.join('\n');
}
