import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import ZAI from 'z-ai-web-dev-sdk';

const execFileAsync = promisify(execFile);

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

export const runtime = 'nodejs';
export const maxDuration = 60;

async function renderPdfFirstPage(pdfPath: string, outDir: string, baseName: string): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const outPrefix = path.join(outDir, baseName);
  await execFileAsync('pdftoppm', ['-png', '-r', '150', '-f', '1', '-l', '1', pdfPath, outPrefix]);
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

/** Parse a PDF using the inline parser (text spans + redacted background). */
async function parsePdfInline(pdfPath: string): Promise<any> {
  const scriptPath = path.join(process.cwd(), 'scripts', 'parse_pdf_inline.py');
  const { stdout } = await execFileAsync('python3', [scriptPath, pdfPath], { maxBuffer: 50 * 1024 * 1024 });
  return JSON.parse(stdout);
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

    if (ext === '.pdf') {
      // Parse into inline-editable format (text spans + redacted background)
      const parsed = await parsePdfInline(savedPath);

      // Also render the original first page as a PNG (for the "Original" toggle)
      let originalPreviewUrl: string | null = null;
      try {
        const previewPath = await renderPdfFirstPage(savedPath, outDir, baseName);
        originalPreviewUrl = await imageToDataUrl(previewPath);
      } catch {
        originalPreviewUrl = null;
      }

      const now = new Date().toISOString();
      const doc = {
        id: `doc-${Date.now()}`,
        pages: parsed.pages,
        sourceType: 'pdf' as const,
        sourceFileName: file.name,
        createdAt: now,
        updatedAt: now,
      };

      return NextResponse.json({
        success: true,
        document: doc,
        preview: originalPreviewUrl,
      });
    }

    // For images and DOCX, fall back to VLM-based extraction (less precise
    // inline editing, but still works). For now, return an error asking
    // for PDF — we can add image/DOCX support later.
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      return NextResponse.json({
        error: 'Image uploads are not yet supported for inline editing. Please upload a PDF for the best experience.',
      }, { status: 415 });
    }

    return NextResponse.json({ error: `Unsupported file type: ${ext}. Please upload a PDF.` }, { status: 415 });
  } catch (err: unknown) {
    console.error('Parse error:', err);
    const msg = err instanceof Error ? err.message : 'Unknown parse error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
