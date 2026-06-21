'use client';

import React, { useMemo } from 'react';
import type { ScheduleDocument, ScheduleClass, ClassHighlight } from '@/lib/schedule-types';

interface Props {
  doc: ScheduleDocument;
}

// Highlight styles for special class rows. The original PDF uses:
//   - sold-out: solid RED background (#ef4136) with white text, no strikethrough
//   - trainer-choice: solid LIME background with dark text
// The other "theme-*" categories are soft pastel gradients used in some
// alternate versions of the schedule (kept for compatibility).
const HIGHLIGHT_STYLES: Record<Exclude<ClassHighlight, 'none' | 'custom'>, { background: string; textColor: string; soldOut?: boolean }> = {
  'sold-out': {
    background: '#ef4136',  // solid red — matches the original PDF
    textColor: '#ffffff',
    soldOut: false,  // original PDF does NOT use strikethrough on sold-out rows
  },
  'trainer-choice': {
    background: '#cdd750',  // solid lime — matches the original PDF
    textColor: '#231f20',
  },
  'theme-pink': {
    background: 'linear-gradient(135deg, rgba(255, 213, 227, 0.74) 0%, rgba(255, 213, 227, 0.54) 100%)',
    textColor: '#453b2a',
  },
  'theme-yellow': {
    background: 'linear-gradient(135deg, rgba(255, 240, 166, 0.74) 0%, rgba(255, 240, 166, 0.54) 100%)',
    textColor: '#453b2a',
  },
  'theme-peach': {
    background: 'linear-gradient(135deg, rgba(255, 220, 154, 0.74) 0%, rgba(255, 220, 154, 0.54) 100%)',
    textColor: '#453b2a',
  },
  'theme-blue': {
    background: 'linear-gradient(135deg, rgba(208, 241, 255, 0.74) 0%, rgba(208, 241, 255, 0.54) 100%)',
    textColor: '#453b2a',
  },
};

/**
 * ScheduleRenderer renders a ScheduleDocument as HTML that visually matches
 * the original uploaded Physique 57 poster:
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ ████████████████████████████████████████████████████████████ │ ← lime border (full page)
 *   │ █  ┌──────────────────────────────────────────────────────┐ █ │
 *   │ █  │ INTERMEDIATE: CARDIO BARREARRE, MAT 57 • INTERMEDI.. │ █ │ ← lime ticker band
 *   │ █  │ FOUNDATION : BARRE 57 • FOUNDATION : BARRE 57 • FO.. │ █ │
 *   │ █  │                                                       │ █ │
 *   │ █  │  ╭───╮                            ╭───────╮           │ █ │
 *   │ █  │  │◉  │   STUDIO SCHEDULE          │BANDRA │           │ █ │ ← vinyl logo (left) + circle badge (right)
 *   │ █  │  ╰───╯   June 1st - June 7th 2026 ╰───────╯           │ █ │ ← italic lime date
 *   │ █  │           A LINKIN PARK SPECIAL                        │ █ │
 *   │ █  │   BEGINNER : BARRE 57, powerCycle                     │ █ │
 *   │ █  │   INTERMEDIATE : CARDIO BARRE, MAT 57, FIT, ...       │ █ │
 *   │ █  │                                                       │ █ │
 *   │ █  │   MONDAY              TUESDAY                         │ █ │
 *   │ █  │   7:30 AM  MAT 57 - Reshma    7:15 AM  BARRE 57 - ... │ █ │
 *   │ █  │   ╔═══════════════════════════╗                       │ █ │ ← soft pastel gradient highlight
 *   │ █  │   ║ 7:30 PM powerCycle - Karan║ (HARRY STYLES VS JT)  │ █ │
 *   │ █  │   ╚═══════════════════════════╝                       │ █ │
 *   │ █  │   WEDNESDAY           THURSDAY                        │ █ │
 *   │ █  │   ...                                                   │ █ │
 *   │ █  └──────────────────────────────────────────────────────┘ █ │
 *   │ ████████████████████████████████████████████████████████████ │
 *   └──────────────────────────────────────────────────────────────┘
 */
export function ScheduleRenderer({ doc }: Props) {
  const t = doc.theme;

  // Build the marquee text — repeat each band's text to fill the width
  const tickerEls = useMemo(() => {
    return doc.tickerBands.map((band, idx) => {
      const single = band.text + ' • ';
      const repeated = single.repeat(40).trim();
      return (
        <div
          key={band.id || `band-${idx}`}
          className="schedule-marquee"
          style={{
            background: t.topBandBg,
            color: band.textColor,
            fontSize: `${band.fontSize}px`,
            fontStyle: band.italic ? 'italic' : 'normal',
            fontFamily: t.fontFamilyTicker,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            padding: '2px 0',
            letterSpacing: '0.02em',
          }}
        >
          <div
            className="schedule-marquee-inner"
            style={{
              display: 'inline-block',
              animation: `schedule-marquee-scroll ${60 + idx * 10}s linear infinite`,
            }}
          >
            {repeated}
          </div>
        </div>
      );
    });
  }, [doc.tickerBands, t]);

  return (
    <div
      style={{
        // Full-page lime background (matches the original PDF's page border)
        background: t.topBandBg,
        padding: '14px',
        boxSizing: 'border-box',
        width: '100%',
        margin: '0 auto',
      }}
    >
      <style>{`
        @keyframes schedule-marquee-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .schedule-marquee:hover .schedule-marquee-inner {
          animation-play-state: paused;
        }
        .schedule-class-row {
          transition: background .15s ease;
          border-radius: 6px;
        }
        .schedule-class-row:hover {
          filter: brightness(0.97);
        }
        .schedule-sold-out {
          text-decoration: line-through;
          text-decoration-color: #dc2626;
          text-decoration-thickness: 1.8px;
          opacity: 0.95;
        }
      `}</style>

      {/* Cream inner card */}
      <div
        className="schedule-doc"
        style={{
          background: t.background,
          color: t.primaryText,
          fontFamily: t.fontFamilyBody,
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '4px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        {/* Lime top band with ticker marquee */}
        {tickerEls.length > 0 && (
          <div style={{ background: t.topBandBg }}>{tickerEls}</div>
        )}

        {/* Header: vinyl logo (left) + STUDIO SCHEDULE centered + BANDRA circle (right) */}
        <div
          style={{
            position: 'relative',
            textAlign: 'center',
            padding: '24px 24px 14px',
          }}
        >
          {/* Vinyl record logo — top left */}
          <VinylLogo accent={t.topBandBg} />

          {/* Location circle badge — top right */}
          {doc.location && <LocationBadge location={doc.location} accent={t.topBandBg} textColor={t.primaryText} fontFamilyHeading={t.fontFamilyHeading} />}

          <h1
            style={{
              fontFamily: t.fontFamilyHeading,
              fontSize: 'clamp(32px, 4.5vw, 48px)',
              lineHeight: 0.95,
              margin: 0,
              color: t.primaryText,
              letterSpacing: '-0.015em',
              fontWeight: 900,
              textTransform: 'uppercase',
            }}
          >
            {doc.studioName}
          </h1>

          {doc.dateRange && (
            <div
              style={{
                fontFamily: t.fontFamilyDisplay,
                fontStyle: 'italic',
                fontSize: 'clamp(20px, 2.4vw, 30px)',
                marginTop: '12px',
                color: t.accent,
                fontWeight: 700,
                letterSpacing: '0.005em',
              }}
            >
              {doc.dateRange}
            </div>
          )}

          {doc.tagline && (
            <div
              style={{
                fontFamily: t.fontFamilyBody,
                fontSize: '9px',
                color: t.mutedText,
                marginTop: '6px',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
              }}
            >
              {doc.tagline}
            </div>
          )}
        </div>

        {/* Class-level rows */}
        {doc.classLevels.length > 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '0 24px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            {doc.classLevels.map((row, i) => (
              <div
                key={i}
                style={{
                  fontFamily: t.fontFamilyBody,
                  fontSize: '11px',
                  color: t.primaryText,
                  letterSpacing: '0.01em',
                  fontWeight: 500,
                }}
              >
                <span style={{ fontWeight: 700 }}>{row.level}</span>
                <span style={{ opacity: 0.85 }}> : {row.classes.join(', ')}</span>
              </div>
            ))}
          </div>
        )}

        {/* Days grid — 2×N matching original 2×2-per-page layout */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0',
            padding: '0 24px 28px',
          }}
        >
          {doc.days.map(day => (
            <DayColumn key={day.id} day={day} doc={doc} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Vinyl record logo — black circle with a blue center, like the original Physique 57 logo. */
function VinylLogo({ accent }: { accent: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '18px',
        left: '20px',
        width: '52px',
        height: '52px',
        borderRadius: '50%',
        background: 'radial-gradient(circle at 50% 50%, #7ecaf0 0%, #7ecaf0 18%, #221e1f 19%, #221e1f 28%, #3a3735 29%, #221e1f 35%, #221e1f 45%, #4a4644 46%, #221e1f 52%, #221e1f 100%)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2), inset 0 0 0 1px rgba(255,255,255,0.08)',
      }}
      aria-hidden
    >
      {/* Ribbon banner */}
      <div
        style={{
          position: 'absolute',
          bottom: '-6px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: accent,
          color: '#221e1f',
          fontSize: '6px',
          fontWeight: 800,
          padding: '1px 6px',
          borderRadius: '2px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
        }}
      >
        Turns 8
      </div>
    </div>
  );
}

/** Circular location badge in the top-right corner. */
function LocationBadge({
  location,
  accent,
  textColor,
  fontFamilyHeading,
}: {
  location: string;
  accent: string;
  textColor: string;
  fontFamilyHeading: string;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '18px',
        right: '20px',
        width: '92px',
        height: '92px',
        borderRadius: '50%',
        background: accent,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 6px rgba(0,0,0,0.10), inset 0 0 0 2px rgba(255,255,255,0.18)',
      }}
    >
      <span
        style={{
          fontFamily: fontFamilyHeading,
          fontSize: location.length > 8 ? '15px' : '18px',
          fontWeight: 800,
          color: textColor,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          lineHeight: 1.0,
          textAlign: 'center',
          padding: '0 6px',
        }}
      >
        {location}
      </span>
    </div>
  );
}

function DayColumn({ day, doc }: { day: ScheduleDocument['days'][number]; doc: ScheduleDocument }) {
  const t = doc.theme;
  return (
    <div
      style={{
        padding: '10px 12px 14px',
        minHeight: '100px',
      }}
    >
      <div
        style={{
          fontFamily: t.fontFamilyHeading,
          fontSize: '14px',
          fontWeight: 800,
          color: t.primaryText,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          paddingBottom: '6px',
          marginBottom: '6px',
          borderBottom: `1.5px solid ${t.primaryText}`,
        }}
      >
        {day.name}
      </div>
      {day.classes.length === 0 ? (
        <div
          style={{
            fontSize: '9px',
            color: t.mutedText,
            opacity: 0.5,
            fontStyle: 'italic',
            padding: '4px 0',
          }}
        >
          No classes
        </div>
      ) : (
        day.classes.map((c, i) => <ClassRow key={c.id || i} cls={c} doc={doc} />)
      )}
    </div>
  );
}

function ClassRow({ cls, doc }: { cls: ScheduleClass; doc: ScheduleDocument }) {
  const t = doc.theme;
  const highlight: ClassHighlight = cls.highlight || 'none';

  // Determine background and text color based on highlight
  let bg = 'transparent';
  let textColor = t.bodyText;
  let isSoldOut = false;
  let hasBackground = false;
  if (highlight !== 'none' && highlight !== 'custom') {
    const style = HIGHLIGHT_STYLES[highlight];
    bg = style.background;
    textColor = style.textColor;
    isSoldOut = !!style.soldOut;
    hasBackground = true;
  } else if (highlight === 'custom' && cls.bgColor) {
    bg = cls.bgColor;
    textColor = cls.textColor || t.bodyText;
    hasBackground = true;
  }

  return (
    <div
      className="schedule-class-row"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        padding: hasBackground ? '5px 8px' : '3px 6px',
        margin: hasBackground ? '2px -4px 3px' : '0 -2px 1px',
        background: bg,
        boxShadow: hasBackground ? '0 4px 10px rgba(69,59,42,0.06)' : 'none',
        backdropFilter: hasBackground ? 'blur(8px) saturate(140%)' : 'none',
        position: 'relative',
      }}
    >
      {/* Time */}
      <div
        style={{
          fontFamily: t.fontFamilyBody,
          fontSize: '9px',
          fontWeight: 600,
          color: textColor,
          textAlign: 'right',
          width: '58px',
          flexShrink: 0,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.1px',
        }}
      >
        {cls.time}
      </div>
      {/* Class + instructor */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          fontFamily: t.fontFamilyBody,
          fontSize: '9px',
          color: textColor,
          fontWeight: 500,
          lineHeight: 1.3,
        }}
      >
        <span
          className={isSoldOut ? 'schedule-sold-out' : undefined}
          style={{ fontWeight: 600 }}
        >
          {cls.className}
        </span>
        {cls.instructor && (
          <>
            {' - '}
            <span className={isSoldOut ? 'schedule-sold-out' : undefined}>
              {cls.instructor}
            </span>
          </>
        )}
        {cls.note && (
          <div
            style={{
              fontSize: '6.5px',
              fontWeight: 400,
              opacity: 0.85,
              marginTop: '1px',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {cls.note}
          </div>
        )}
      </div>
    </div>
  );
}
