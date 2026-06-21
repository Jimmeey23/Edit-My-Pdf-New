import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readFile } from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import ZAI from 'z-ai-web-dev-sdk';

const exec = promisify(execFile);

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Export the current schedule as a PDF.
 *
 * Strategy:
 * 1. Build a self-contained HTML string that renders the schedule identically
 *    to the on-screen preview.
 * 2. Write it to a temp file.
 * 3. Use Playwright (chromium, headless) to render it to PDF.
 *
 * If Playwright is not available we fall back to a simple HTML download.
 */
export async function POST(req: NextRequest) {
  try {
    const { document } = await req.json();
    if (!document) return NextResponse.json({ error: 'document is required' }, { status: 400 });

    const html = renderScheduleHTML(document);
    const tmpDir = '/home/z/my-project/uploads/exports';
    await mkdir(tmpDir, { recursive: true });
    const htmlPath = path.join(tmpDir, `export-${Date.now()}.html`);
    const pdfPath = htmlPath.replace('.html', '.pdf');
    await writeFile(htmlPath, html, 'utf-8');

    // Try Playwright via Node script
    try {
      await exec('node', ['-e', `
        const { chromium } = require('playwright');
        (async () => {
          const browser = await chromium.launch({ args: ['--no-sandbox'] });
          const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
          await page.goto('file://${htmlPath}', { waitUntil: 'networkidle' });
          await page.pdf({ path: '${pdfPath}', format: 'A4', printBackground: true, margin: { top: '8mm', bottom: '8mm', left: '8mm', right: '8mm' }, preferCSSPageSize: false });
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
      // Fallback: return HTML
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

/** Render a ScheduleDocument to a self-contained HTML string for PDF export. */
function renderScheduleHTML(doc: any): string {
  const t = doc.theme;
  const tickerHtml = (doc.tickerBands || []).map((b: any, i: number) => {
    const single = b.text + ' • ';
    const repeated = single.repeat(40).trim();
    return `<div style="color:${b.textColor};background:${b.bgColor === 'transparent' ? 'transparent' : b.bgColor};font-size:${b.fontSize}px;font-style:${b.italic ? 'italic' : 'normal'};white-space:nowrap;overflow:hidden;padding:2px 0;">${esc(repeated)}</div>`;
  }).join('');

  const classLevelRows = (doc.classLevels || []).map((r: any) => `
    <div style="font-family:${t.fontFamilyBody};font-size:11px;color:${t.primaryText};">
      <span style="font-weight:700">${esc(r.level)}</span><span style="opacity:0.85"> : ${esc(r.classes.join(', '))}</span>
    </div>`).join('');

  const dayCards = (doc.days || []).map((d: any) => {
    const rows = d.classes.length === 0
      ? `<div style="font-size:10px;color:${t.mutedText};opacity:0.5;font-style:italic;padding:6px 0;">No classes</div>`
      : d.classes.map((c: any) => {
          const band = t.bandColors[c.level] || t.accent;
          return `<div style="display:flex;align-items:flex-start;gap:6px;padding:4px 4px;">
            <div style="width:3px;align-self:stretch;background:${band};border-radius:2px;flex-shrink:0;min-height:28px;"></div>
            <div style="flex:1;min-width:0;">
              <div style="font-family:${t.fontFamilyBody};font-size:10px;font-weight:700;color:${t.primaryText};line-height:1.1;">${esc(c.time)}</div>
              <div style="font-family:${t.fontFamilyBody};font-size:10px;color:${t.bodyText};line-height:1.25;margin-top:1px;word-break:break-word;">
                <span style="font-weight:600">${esc(c.className)}</span>${c.instructor ? `<span style="opacity:0.8"> — ${esc(c.instructor)}</span>` : ''}
              </div>
            </div>
          </div>`;
        }).join('');
    return `<div style="background:${t.cardBg};border:1px solid ${t.cardBorder};border-radius:8px;padding:12px 10px;display:flex;flex-direction:column;gap:6px;">
      <div style="font-family:${t.fontFamilyHeading};font-size:13px;font-weight:800;color:${t.primaryText};letter-spacing:0.05em;text-transform:uppercase;padding-bottom:6px;border-bottom:1.5px solid ${t.primaryText};margin-bottom:2px;">${esc(d.name)}</div>
      ${rows}
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(doc.studioName)} — ${esc(doc.location)}</title>
<style>
  @page { size: A4 landscape; margin: 8mm; }
  html, body { margin: 0; padding: 0; }
  body { background: #ffffff; }
</style>
</head>
<body>
  <div style="background:${t.background};color:${t.primaryText};font-family:${t.fontFamilyBody};width:100%;max-width:1100px;margin:0 auto;padding:24px 28px 32px;box-sizing:border-box;">
    ${tickerHtml ? `<div style="margin-bottom:8px;">${tickerHtml}</div>` : ''}
    <div style="text-align:center;margin:20px 0 16px;">
      <h1 style="font-family:${t.fontFamilyHeading};font-size:40px;line-height:1.0;margin:0;color:${t.primaryText};font-weight:800;text-transform:uppercase;">${esc(doc.studioName)}</h1>
      ${doc.location ? `<div style="font-family:${t.fontFamilyHeading};font-size:24px;margin-top:6px;color:${t.primaryText};font-weight:700;letter-spacing:0.02em;text-transform:uppercase;">${esc(doc.location)}</div>` : ''}
      ${doc.dateRange ? `<div style="font-family:${t.fontFamilyDisplay};font-style:italic;font-size:28px;margin-top:10px;color:${t.accent};font-weight:700;">${esc(doc.dateRange)}</div>` : ''}
      ${doc.tagline ? `<div style="font-family:${t.fontFamilyBody};font-size:10px;color:${t.mutedText};margin-top:6px;letter-spacing:0.12em;text-transform:uppercase;">${esc(doc.tagline)}</div>` : ''}
    </div>
    ${classLevelRows ? `<div style="text-align:center;margin-bottom:18px;display:flex;flex-direction:column;gap:4px;">${classLevelRows}</div>` : ''}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;">${dayCards}</div>
  </div>
</body>
</html>`;
}
