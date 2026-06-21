import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import ZAI from 'z-ai-web-dev-sdk';

const execFileAsync = promisify(execFile);

const UPLOAD_DIR = '/home/z/my-project/uploads';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ParsedSchedule {
  studioName: string;
  location: string;
  dateRange: string;
  tagline?: string;
  tickerBands: Array<{ text: string; textColor: string; bgColor: string; fontSize: number; italic?: boolean }>;
  classLevels: Array<{ level: string; classes: string[] }>;
  days: Array<{
    id: string;
    name: string;
    classes: Array<{
      id: string;
      time: string;
      className: string;
      instructor: string;
      level: string;
      highlight?: string;
      note?: string;
      bgColor?: string;
      textColor?: string;
    }>;
  }>;
  theme: Record<string, unknown>;
  meta: Record<string, unknown>;
}

/** Render the first page of a PDF to a PNG using pdftoppm. */
async function renderPdfFirstPage(pdfPath: string, outDir: string, baseName: string): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const outPrefix = path.join(outDir, baseName);
  await execFileAsync('pdftoppm', ['-png', '-r', '120', '-f', '1', '-l', '1', pdfPath, outPrefix]);
  const candidate = `${outPrefix}-1.png`;
  if (existsSync(candidate)) return candidate;
  const { readdir } = await import('fs/promises');
  const files = await readdir(outDir);
  const png = files.find(f => f.startsWith(baseName) && f.endsWith('.png'));
  if (!png) throw new Error('Failed to render PDF preview');
  return path.join(outDir, png);
}

async function imageToDataUrl(imagePath: string): Promise<string> {
  const buf = await readFile(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/** Use VLM to extract a structured schedule from an image. */
async function parseWithVLM(imagePath: string): Promise<ParsedSchedule> {
  const zai = await ZAI.create();
  const dataUrl = await imageToDataUrl(imagePath);

  const prompt = `You are looking at a fitness studio's weekly class schedule poster.
Extract the entire schedule as strict JSON (no markdown, no commentary) using EXACTLY this shape:

{
  "studioName": string,
  "location": string,
  "dateRange": string,
  "tagline": string,
  "tickerBands": [
    { "text": "FOUNDATION : BARRE 57", "textColor": "#181818", "bgColor": "transparent", "fontSize": 7, "italic": false }
  ],
  "classLevels": [
    { "level": "BEGINNER", "classes": ["BARRE 57", "powerCycle"] },
    { "level": "INTERMEDIATE", "classes": ["CARDIO BARRE", "MAT 57", "FIT", "BACK BODY BLAZE", "powerCycle"] },
    { "level": "ADVANCED", "classes": ["HIIT", "AMPED UP!"] }
  ],
  "days": [
    {
      "id": "day-1",
      "name": "MONDAY",
      "classes": [
        { "id": "MONDAY-1", "time": "7:30 AM", "className": "MAT 57", "instructor": "Reshma", "level": "BEGINNER" }
      ]
    }
  ],
  "theme": {
    "background": "#ffffff",
    "primaryText": "#121213",
    "bodyText": "#231f20",
    "mutedText": "#181818",
    "accent": "#cdd750",
    "accentText": "#121213",
    "bandColors": { "BEGINNER": "#cdd750", "INTERMEDIATE": "#efefdf", "ADVANCED": "#f3c969" },
    "cardBg": "#ffffff",
    "cardBorder": "#00000022"
  }
}

Rules:
- Include every day you can see (MONDAY..SUNDAY). Omit days not visible.
- Include every class row visible in each day column, preserving top-to-bottom order.
- "level" must be one of BEGINNER / INTERMEDIATE / ADVANCED.
- "time" must look like "7:30 AM" / "6:00 PM".
- Pick "accent" from the italic display color of the date range if visible.
- Output ONLY the JSON, nothing else.`;

  const completion = await zai.chat.completions.createVision({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
    thinking: { type: 'disabled' },
  });

  const raw = completion.choices[0]?.message?.content ?? '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('VLM returned no JSON');
  return JSON.parse(jsonMatch[0]);
}

/** Parse a PDF using the local Python parser. */
async function parsePdfLocally(pdfPath: string): Promise<ParsedSchedule> {
  const scriptPath = path.join(process.cwd(), 'scripts', 'parse_pdf.py');
  const { stdout } = await execFileAsync('python3', [scriptPath, pdfPath], { maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(stdout);
}

/** Convert a DOCX to PDF using LibreOffice, then to PNG. */
async function convertDocxToImage(docxPath: string, outDir: string, baseName: string): Promise<string | null> {
  await mkdir(outDir, { recursive: true });
  try {
    await execFileAsync('libreoffice', ['--headless', '--convert-to', 'pdf', '--outdir', outDir, docxPath], { timeout: 30000 });
    const pdfPath = path.join(outDir, `${baseName}.pdf`);
    if (existsSync(pdfPath)) {
      return await renderPdfFirstPage(pdfPath, outDir, `${baseName}-preview`);
    }
  } catch {
    // ignore
  }
  return null;
}

function makeId(prefix: string, i: number) {
  return `${prefix}-${i}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Normalise into our canonical ScheduleDocument shape. */
function normalizeSchedule(parsed: ParsedSchedule, sourceFileName: string, sourceType: 'pdf' | 'image' | 'docx') {
  const now = new Date().toISOString();
  const days = (parsed.days || []).map((d, di) => ({
    id: d.id || `day-${di + 1}`,
    name: d.name,
    classes: (d.classes || []).map((c, ci) => ({
      id: c.id || makeId(d.name, ci + 1),
      time: c.time,
      className: c.className,
      instructor: c.instructor,
      level: (['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].includes(c.level) ? c.level : 'BEGINNER') as 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED',
      highlight: (['none', 'sold-out', 'trainer-choice', 'custom'].includes(c.highlight as string) ? c.highlight : 'none') as 'none' | 'sold-out' | 'trainer-choice' | 'custom',
      note: typeof c.note === 'string' ? c.note : '',
      bgColor: typeof c.bgColor === 'string' ? c.bgColor : undefined,
      textColor: typeof c.textColor === 'string' ? c.textColor : undefined,
    })),
  }));

  const theme = {
    background: '#efeede',
    topBandBg: '#cdd750',
    primaryText: '#121213',
    bodyText: '#231f20',
    mutedText: '#181818',
    accent: '#cdd750',
    accentText: '#121213',
    bandColors: {
      BEGINNER: '#cdd750',
      INTERMEDIATE: '#efefdf',
      ADVANCED: '#f3c969',
    } as Record<string, string>,
    soldOutBg: '#ed603d',
    soldOutText: '#ffffff',
    trainerChoiceBg: '#cdd750',
    cardBg: '#efeede',
    cardBorder: '#00000022',
    fontFamilyHeading: 'Agrandir, Inter, system-ui, sans-serif',
    fontFamilyBody: 'Montserrat, Inter, system-ui, sans-serif',
    fontFamilyDisplay: 'IvyPresto Display, Playfair Display, Georgia, serif',
    fontFamilyTicker: 'Sweet Sans Pro, Inter, system-ui, sans-serif',
    ...(parsed.theme || {}),
  };

  return {
    id: `doc-${Date.now()}`,
    studioName: parsed.studioName || 'STUDIO SCHEDULE',
    location: parsed.location || 'STUDIO',
    dateRange: parsed.dateRange || '',
    tagline: parsed.tagline || '',
    tickerBands: (parsed.tickerBands || []).map((t, i) => ({ id: `band-${i + 1}`, ...t })),
    classLevels: parsed.classLevels || [],
    days,
    theme,
    meta: {
      sourceFileName,
      sourceType,
      createdAt: now,
      updatedAt: now,
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    await mkdir(UPLOAD_DIR, { recursive: true });
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const savedPath = path.join(UPLOAD_DIR, `${Date.now()}-${safeName}`);
    await writeFile(savedPath, bytes);

    const ext = path.extname(file.name).toLowerCase();
    const baseName = path.basename(safeName, ext);
    const outDir = path.join(UPLOAD_DIR, 'renders');
    let sourceType: 'pdf' | 'image' | 'docx' = 'pdf';
    let parsed: ParsedSchedule;
    let previewImagePath: string | null = null;

    if (ext === '.pdf') {
      sourceType = 'pdf';
      try {
        parsed = await parsePdfLocally(savedPath);
      } catch (err) {
        console.error('Local PDF parse failed, falling back to VLM:', err);
        previewImagePath = await renderPdfFirstPage(savedPath, outDir, baseName);
        parsed = await parseWithVLM(previewImagePath);
      }
      if (!previewImagePath) {
        try {
          previewImagePath = await renderPdfFirstPage(savedPath, outDir, baseName);
        } catch {
          previewImagePath = null;
        }
      }
    } else if (ext === '.docx') {
      sourceType = 'docx';
      const img = await convertDocxToImage(savedPath, outDir, baseName);
      if (!img) {
        return NextResponse.json({ error: 'Failed to convert DOCX. Please upload a PDF or image instead.' }, { status: 422 });
      }
      previewImagePath = img;
      parsed = await parseWithVLM(img);
    } else if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(ext)) {
      sourceType = 'image';
      previewImagePath = savedPath;
      parsed = await parseWithVLM(savedPath);
    } else {
      return NextResponse.json({ error: `Unsupported file type: ${ext}` }, { status: 415 });
    }

    const doc = normalizeSchedule(parsed, file.name, sourceType);

    let previewDataUrl: string | null = null;
    if (previewImagePath && existsSync(previewImagePath)) {
      try {
        previewDataUrl = await imageToDataUrl(previewImagePath);
      } catch {
        previewDataUrl = null;
      }
    }

    return NextResponse.json({
      success: true,
      document: doc,
      preview: previewDataUrl,
    });
  } catch (err: unknown) {
    console.error('Parse error:', err);
    const msg = err instanceof Error ? err.message : 'Unknown parse error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
