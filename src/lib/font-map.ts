'use client';

// Map PDF font names to brand-specified font stacks.
// The original posters use:
//   - Agrandir-GrandHeavy → heavy display sans (we use "Inter" 900 as closest web equivalent,
//     since Agrandir is a commercial font not available on Google Fonts)
//   - IvyPrestoDisplay-BoldItalic → Playfair Display italic (loaded from Google Fonts)
//   - Montserrat → Montserrat (loaded from Google Fonts)
//   - Sweet Sans Pro → Montserrat (closest web equivalent for the ticker)
//   - MyriadPro-Regular → Inter (closest web equivalent)

export interface FontMapping {
  fontFamily: string;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
}

export function mapPdfFont(font: string, size: number): FontMapping {
  const f = font.toLowerCase();
  // Display / heading fonts (Agrandir) — used for "STUDIO SCHEDULE" and day headers
  if (f.includes('agrandir')) {
    return { fontFamily: 'var(--font-agrandir), "Arial Black", "Helvetica Neue", Arial, sans-serif', fontWeight: 900, fontStyle: 'normal' };
  }
  // Italic display font (IvyPresto) — used for the date
  if (f.includes('ivypresto')) {
    return { fontFamily: 'var(--font-playfair-display), "Playfair Display", Georgia, serif', fontWeight: 700, fontStyle: 'italic' };
  }
  // Body text (Montserrat) — used for class details, times, class level rows
  if (f.includes('montserrat')) {
    if (f.includes('bold')) {
      return { fontFamily: 'var(--font-montserrat), Montserrat, "Helvetica Neue", Arial, sans-serif', fontWeight: 700, fontStyle: 'normal' };
    }
    if (f.includes('thin')) {
      return { fontFamily: 'var(--font-montserrat), Montserrat, "Helvetica Neue", Arial, sans-serif', fontWeight: 200, fontStyle: 'normal' };
    }
    if (f.includes('light')) {
      return { fontFamily: 'var(--font-montserrat), Montserrat, "Helvetica Neue", Arial, sans-serif', fontWeight: 300, fontStyle: 'normal' };
    }
    if (f.includes('regular')) {
      return { fontFamily: 'var(--font-montserrat), Montserrat, "Helvetica Neue", Arial, sans-serif', fontWeight: 400, fontStyle: 'normal' };
    }
    return { fontFamily: 'var(--font-montserrat), Montserrat, "Helvetica Neue", Arial, sans-serif', fontWeight: 500, fontStyle: 'normal' };
  }
  // Ticker (Sweet Sans Pro) — used for the marquee border text
  if (f.includes('sweet')) {
    return { fontFamily: 'var(--font-montserrat), Montserrat, "Helvetica Neue", Arial, sans-serif', fontWeight: 500, fontStyle: 'normal' };
  }
  // MyriadPro
  if (f.includes('myriad')) {
    return { fontFamily: 'var(--font-montserrat), Montserrat, "Helvetica Neue", Arial, sans-serif', fontWeight: 400, fontStyle: 'normal' };
  }
  // Generic fallbacks
  if (f.includes('bold') || f.includes('heavy') || f.includes('black')) {
    return { fontFamily: 'var(--font-montserrat), Montserrat, "Helvetica Neue", Arial, sans-serif', fontWeight: 800, fontStyle: 'normal' };
  }
  if (f.includes('italic') || f.includes('ita')) {
    return { fontFamily: 'var(--font-playfair-display), "Playfair Display", Georgia, serif', fontWeight: 500, fontStyle: 'italic' };
  }
  return { fontFamily: 'var(--font-montserrat), Montserrat, "Helvetica Neue", Arial, sans-serif', fontWeight: 500, fontStyle: 'normal' };
}
