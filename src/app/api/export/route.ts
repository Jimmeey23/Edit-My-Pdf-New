import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readFile } from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

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
  const tickerHtml = (doc.tickerBands || []).map((b: any) => {
    const single = b.text + ' • ';
    const repeated = single.repeat(40).trim();
    return `<div style="background:${t.topBandBg};color:${b.textColor};font-size:${b.fontSize}px;font-family:${t.fontFamilyTicker};font-weight:500;white-space:nowrap;overflow:hidden;padding:2px 0;letter-spacing:0.02em;">${esc(repeated)}</div>`;
  }).join('');

  const classLevelRows = (doc.classLevels || []).map((r: any) => `
    <div style="font-family:${t.fontFamilyBody};font-size:11px;color:${t.primaryText};font-weight:500;letter-spacing:0.01em;">
      <span style="font-weight:700">${esc(r.level)}</span><span style="opacity:0.85"> : ${esc(r.classes.join(', '))}</span>
    </div>`).join('');

  const dayCount = (doc.days || []).length;
  const gridCols = dayCount <= 4 ? `repeat(${dayCount}, 1fr)` : 'repeat(4, 1fr)';

  const dayColumns = (doc.days || []).map((d: any) => {
    const rows = d.classes.length === 0
      ? `<div style="font-size:9px;color:${t.mutedText};opacity:0.5;font-style:italic;padding:4px 0;">No classes</div>`
      : d.classes.map((c: any) => {
          const highlight = c.highlight || 'none';
          let bg = 'transparent';
          let textColor = t.bodyText;
          let isSoldOut = false;
          if (highlight === 'sold-out') {
            bg = t.soldOutBg;
            textColor = t.soldOutText;
            isSoldOut = true;
          } else if (highlight === 'trainer-choice') {
            bg = t.trainerChoiceBg;
            textColor = t.primaryText;
          } else if (highlight === 'custom' && c.bgColor) {
            bg = c.bgColor;
            textColor = c.textColor || t.bodyText;
          }
          const strikeClass = isSoldOut ? 'text-decoration:line-through;text-decoration-color:#dc2626;text-decoration-thickness:2px;' : '';
          return `<div style="display:flex;align-items:flex-start;gap:8px;padding:3px 6px;margin:0 -6px 1px;background:${bg};border-radius:${highlight !== 'none' ? '3px' : '0'};position:relative;">
            <div style="font-family:${t.fontFamilyBody};font-size:9.5px;font-weight:600;color:${textColor};text-align:right;width:62px;flex-shrink:0;font-variant-numeric:tabular-nums;letter-spacing:-0.1px;">${esc(c.time)}</div>
            <div style="flex:1;min-width:0;font-family:${t.fontFamilyBody};font-size:9.5px;color:${textColor};font-weight:500;line-height:1.3;">
              <span style="font-weight:600;${strikeClass}">${esc(c.className)}</span>${c.instructor ? `<span style="${strikeClass}"> - ${esc(c.instructor)}</span>` : ''}
              ${c.note ? `<div style="font-size:6.5px;font-weight:400;opacity:0.9;margin-top:1px;letter-spacing:0.08em;text-transform:uppercase;">${esc(c.note)}</div>` : ''}
            </div>
          </div>`;
        }).join('');
    return `<div style="padding:12px 14px 16px;border-right:1px solid ${t.cardBorder};min-height:120px;">
      <div style="font-family:${t.fontFamilyHeading};font-size:15px;font-weight:800;color:${t.primaryText};letter-spacing:0.04em;text-transform:uppercase;padding-bottom:8px;margin-bottom:8px;border-bottom:1.5px solid ${t.primaryText};">${esc(d.name)}</div>
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
  <div style="background:${t.background};color:${t.primaryText};font-family:${t.fontFamilyBody};margin:0 auto;box-sizing:border-box;position:relative;overflow:hidden;">
    ${tickerHtml ? `<div style="background:${t.topBandBg};">${tickerHtml}</div>` : ''}
    <div style="position:relative;text-align:center;padding:32px 24px 16px;">
      ${doc.location ? `<div style="position:absolute;top:20px;right:28px;width:110px;height:110px;border-radius:50%;background:${t.topBandBg};display:flex;align-items:center;justify-content:center;flex-direction:column;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <span style="font-family:${t.fontFamilyHeading};font-size:18px;font-weight:800;color:${t.primaryText};letter-spacing:0.04em;text-transform:uppercase;line-height:1.0;">${esc(doc.location)}</span>
        <span style="font-family:${t.fontFamilyBody};font-size:8px;color:${t.primaryText};opacity:0.7;margin-top:4px;letter-spacing:0.15em;text-transform:uppercase;">Studio</span>
      </div>` : ''}
      <h1 style="font-family:${t.fontFamilyHeading};font-size:48px;line-height:0.95;margin:0;color:${t.primaryText};letter-spacing:-0.015em;font-weight:900;text-transform:uppercase;">${esc(doc.studioName)}</h1>
      ${doc.dateRange ? `<div style="font-family:${t.fontFamilyDisplay};font-style:italic;font-size:28px;margin-top:14px;color:${t.accent};font-weight:700;">${esc(doc.dateRange)}</div>` : ''}
      ${doc.tagline ? `<div style="font-family:${t.fontFamilyBody};font-size:9px;color:${t.mutedText};margin-top:6px;letter-spacing:0.18em;text-transform:uppercase;">${esc(doc.tagline)}</div>` : ''}
    </div>
    ${classLevelRows ? `<div style="text-align:center;padding:0 24px 18px;display:flex;flex-direction:column;gap:4px;">${classLevelRows}</div>` : ''}
    <div style="display:grid;grid-template-columns:${gridCols};gap:0;padding:0 24px 32px;">${dayColumns}</div>
  </div>
</body>
</html>`;
}
