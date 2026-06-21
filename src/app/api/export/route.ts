import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readFile } from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execFile);

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Export the edited schedule as a PDF.
 *
 * Strategy: render each page's background image + edited text spans as an HTML
 * page, then use Playwright to convert to PDF. The background image is the
 * text-redacted original PDF, so the exported PDF looks identical to the
 * original — only the text content reflects the user's edits.
 */
export async function POST(req: NextRequest) {
  try {
    const { document } = await req.json();
    if (!document || !document.pages) {
      return NextResponse.json({ error: 'document with pages is required' }, { status: 400 });
    }

    const html = renderInlineHTML(document);
    const tmpDir = '/home/z/my-project/uploads/exports';
    await mkdir(tmpDir, { recursive: true });
    const htmlPath = path.join(tmpDir, `export-${Date.now()}.html`);
    const pdfPath = htmlPath.replace('.html', '.pdf');
    await writeFile(htmlPath, html, 'utf-8');

    try {
      await exec('node', ['-e', `
        const { chromium } = require('playwright');
        (async () => {
          const browser = await chromium.launch({ args: ['--no-sandbox'] });
          const page = await browser.newPage();
          await page.goto('file://${htmlPath}', { waitUntil: 'networkidle' });
          await page.pdf({ path: '${pdfPath}', format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' }, preferCSSPageSize: false });
          await browser.close();
        })().catch(e => { console.error(e); process.exit(1); });
      `], { timeout: 30000 });
      const pdfBuf = await readFile(pdfPath);
      return new NextResponse(pdfBuf, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="schedule.pdf"`,
        },
      });
    } catch (err) {
      console.error('Playwright PDF failed, returning HTML', err);
      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
          'Content-Disposition': `attachment; filename="schedule.html"`,
        },
      });
    }
  } catch (err: unknown) {
    console.error('Export error:', err);
    const msg = err instanceof Error ? err.message : 'Export failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function mapFont(font: string): { fontFamily: string; fontWeight: number; fontStyle: string } {
  const f = font.toLowerCase();
  if (f.includes('agrandir')) return { fontFamily: '"Arial Black", "Helvetica Neue", Arial, sans-serif', fontWeight: 900, fontStyle: 'normal' };
  if (f.includes('ivypresto')) return { fontFamily: '"Playfair Display", Georgia, serif', fontWeight: 700, fontStyle: 'italic' };
  if (f.includes('montserrat')) {
    if (f.includes('bold')) return { fontFamily: 'Montserrat, Arial, sans-serif', fontWeight: 700, fontStyle: 'normal' };
    if (f.includes('thin')) return { fontFamily: 'Montserrat, Arial, sans-serif', fontWeight: 300, fontStyle: 'normal' };
    return { fontFamily: 'Montserrat, Arial, sans-serif', fontWeight: 500, fontStyle: 'normal' };
  }
  if (f.includes('sweet')) return { fontFamily: '"Helvetica Neue", Arial, sans-serif', fontWeight: 500, fontStyle: 'normal' };
  if (f.includes('bold') || f.includes('heavy')) return { fontFamily: '"Helvetica Neue", Arial, sans-serif', fontWeight: 800, fontStyle: 'normal' };
  if (f.includes('italic') || f.includes('ita')) return { fontFamily: 'Georgia, serif', fontWeight: 500, fontStyle: 'italic' };
  return { fontFamily: '"Helvetica Neue", Arial, sans-serif', fontWeight: 500, fontStyle: 'normal' };
}

function renderInlineHTML(doc: any): string {
  const pagesHtml = doc.pages.map((page: any) => {
    const scale = 1; // 1pt = 1px in the export
    const width = page.pdfWidth;
    const height = page.pdfHeight;
    const spansHtml = page.spans.map((span: any) => {
      const fm = mapFont(span.font);
      const isTicker = (span.x2 - span.x) > 400 && (span.font.toLowerCase().includes('sweet') || span.text.includes('•'));
      return `<div style="position:absolute;left:${span.x * scale}px;top:${span.y * scale}px;min-width:${Math.max(span.x2 - span.x, 4)}px;height:${Math.max(span.y2 - span.y, span.size * 1.1)}px;font-family:${fm.fontFamily};font-size:${span.size}px;font-weight:${fm.fontWeight};font-style:${fm.fontStyle};color:${span.color};line-height:1.0;letter-spacing:0.01em;white-space:${isTicker ? 'nowrap' : 'pre'};overflow:hidden;padding:0;margin:0;box-sizing:border-box;">${esc(span.text)}</div>`;
    }).join('');
    return `<div style="position:relative;width:${width}px;height:${height}px;background:#fff;page-break-after:always;overflow:hidden;">
      <img src="${page.backgroundImage}" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;" />
      ${spansHtml}
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Schedule</title>
<style>
  @page { size: auto; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
</style>
</head>
<body>
${pagesHtml}
</body>
</html>`;
}
