import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readFile } from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execFile);

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Export the edited schedule as a PDF by compositing the background image
 * with the edited text spans in HTML, then rendering to PDF via Playwright.
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

    // Use Playwright to render HTML → PDF
    await exec('node', ['-e', `
      const { chromium } = require('playwright');
      (async () => {
        const browser = await chromium.launch({ args: ['--no-sandbox'] });
        const page = await browser.newPage();
        await page.goto('file:${htmlPath}', { waitUntil: 'networkidle' });
        await page.pdf({
          path: '${pdfPath}',
          width: '${document.pages[0].pdfWidth}px',
          height: '${document.pages[0].pdfHeight}px',
          printBackground: true,
          margin: { top: '0', bottom: '0', left: '0', right: '0' },
          preferCSSPageSize: false,
        });
        await browser.close();
      })().catch(e => { console.error(e); process.exit(1); });
    `], { timeout: 30000 });

    const pdfBuf = await readFile(pdfPath);
    return new NextResponse(pdfBuf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="schedule-edited.pdf"`,
      },
    });
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
  if (f.includes('agrandir')) return { fontFamily: 'Inter, "Arial Black", sans-serif', fontWeight: 900, fontStyle: 'normal' };
  if (f.includes('ivypresto')) return { fontFamily: '"Playfair Display", Georgia, serif', fontWeight: 700, fontStyle: 'italic' };
  if (f.includes('montserrat')) {
    if (f.includes('bold')) return { fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontStyle: 'normal' };
    if (f.includes('thin')) return { fontFamily: 'Montserrat, sans-serif', fontWeight: 200, fontStyle: 'normal' };
    return { fontFamily: 'Montserrat, sans-serif', fontWeight: 500, fontStyle: 'normal' };
  }
  if (f.includes('sweet')) return { fontFamily: 'Montserrat, sans-serif', fontWeight: 500, fontStyle: 'normal' };
  return { fontFamily: 'Montserrat, sans-serif', fontWeight: 500, fontStyle: 'normal' };
}

function renderInlineHTML(doc: any): string {
  const pagesHtml = doc.pages.map((page: any) => {
    const width = page.pdfWidth;
    const height = page.pdfHeight;
    const spansHtml = page.spans.filter((s: any) => !s.hidden).map((span: any) => {
      const fm = mapFont(span.font);
      const fontSize = span.size ?? 9;
      const fontWeight = span.bold !== undefined ? (span.bold ? 800 : 400) : fm.fontWeight;
      const fontStyle = span.italic !== undefined ? (span.italic ? 'italic' : 'normal') : fm.fontStyle;
      const letterSpacing = span.letterSpacing !== undefined ? `${span.letterSpacing}px` : '0.01em';
      const textAlign = span.align ?? 'left';
      const isTicker = (span.x2 - span.x) > 400 && (span.font.toLowerCase().includes('sweet') || span.text.includes('•'));

      let transform = '';
      let left = span.x;
      let top = span.y;
      let elWidth = span.x2 - span.x;
      let elHeight = span.y2 - span.y;

      if (span.rotation === -90) {
        transform = 'transform: rotate(-90deg) translate(-100%, 0); transform-origin: top left;';
        [elWidth, elHeight] = [elHeight, elWidth];
      } else if (span.rotation === 90) {
        transform = 'transform: rotate(90deg) translate(0, -100%); transform-origin: top left;';
        [elWidth, elHeight] = [elHeight, elWidth];
      }

      return `<div style="position:absolute;left:${left}px;top:${top}px;min-width:${Math.max(elWidth, 4)}px;height:${Math.max(elHeight, fontSize * 1.1)}px;font-family:${fm.fontFamily};font-size:${fontSize}px;font-weight:${fontWeight};font-style:${fontStyle};color:${span.color};line-height:1.0;letter-spacing:${letterSpacing};white-space:${isTicker ? 'nowrap' : 'pre'};overflow:hidden;text-align:${textAlign};${transform}padding:0;margin:0;box-sizing:border-box;">${esc(span.text)}</div>`;
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
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@200;300;400;500;600;700;800&family=Playfair+Display:ital,wght@1,700&family=Inter:wght@900&display=swap" rel="stylesheet" />
<style>
  @page { size: auto; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
</style>
</head>
<body>
${pagesHtml}
</body>
</html>`;
}
