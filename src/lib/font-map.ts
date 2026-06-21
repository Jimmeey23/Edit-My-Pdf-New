'use client';

// Map PDF font names to web-safe CSS font stacks with matching weight/style.
// The original posters use Agrandir (heavy display), Montserrat (body),
// IvyPresto Display (italic date), and Sweet Sans Pro (ticker). We don't
// have these fonts installed, so we map them to close web equivalents.

interface FontMapping {
  fontFamily: string;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
}

export function mapPdfFont(font: string, size: number): FontMapping {
  const f = font.toLowerCase();
  // Display / heading fonts (Agrandir, IvyPresto)
  if (f.includes('agrandir')) {
    return { fontFamily: '"Arial Black", "Helvetica Neue", Arial, sans-serif', fontWeight: 900, fontStyle: 'normal' };
  }
  if (f.includes('ivypresto') || f.includes('ivypresto')) {
    return { fontFamily: '"Playfair Display", Georgia, "Times New Roman", serif', fontWeight: 700, fontStyle: 'italic' };
  }
  // Body text (Montserrat)
  if (f.includes('montserrat')) {
    if (f.includes('bold')) {
      return { fontFamily: 'Montserrat, "Helvetica Neue", Arial, sans-serif', fontWeight: 700, fontStyle: 'normal' };
    }
    if (f.includes('thin')) {
      return { fontFamily: 'Montserrat, "Helvetica Neue", Arial, sans-serif', fontWeight: 300, fontStyle: 'normal' };
    }
    return { fontFamily: 'Montserrat, "Helvetica Neue", Arial, sans-serif', fontWeight: 500, fontStyle: 'normal' };
  }
  // Ticker (Sweet Sans Pro)
  if (f.includes('sweet') || f.includes('sweet sans')) {
    return { fontFamily: '"Helvetica Neue", Arial, sans-serif', fontWeight: 500, fontStyle: 'normal' };
  }
  // Generic fallbacks
  if (f.includes('bold') || f.includes('heavy') || f.includes('black')) {
    return { fontFamily: '"Helvetica Neue", Arial, sans-serif', fontWeight: 800, fontStyle: 'normal' };
  }
  if (f.includes('italic') || f.includes('ita')) {
    return { fontFamily: 'Georgia, serif', fontWeight: 500, fontStyle: 'italic' };
  }
  return { fontFamily: '"Helvetica Neue", Arial, sans-serif', fontWeight: 500, fontStyle: 'normal' };
}
