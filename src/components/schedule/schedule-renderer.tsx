'use client';

import React, { useMemo } from 'react';
import type { ScheduleDocument, ScheduleClass, ClassHighlight } from '@/lib/schedule-types';

interface Props {
  doc: ScheduleDocument;
}

/**
 * ScheduleRenderer renders a ScheduleDocument as HTML that visually matches
 * the original uploaded poster:
 *
 *   ┌───────────────────────────────────────────────────────────┐
 *   │ INTERMEDIATE: CARDIO BARREARRE, MAT 57 • INTERMEDIATE:...│ ← lime band + ticker
 *   │ FOUNDATION : BARRE 57 • FOUNDATION : BARRE 57 • FOUNDAT.. │ ← lime band + ticker
 *   ├───────────────────────────────────────────────────────────┤
 *   │                          ╭─────╮                          │
 *   │      STUDIO SCHEDULE     │BANDRA│   (lime circle badge)   │
 *   │   June 1st - June 7th 2026╰─────╯   (italic lime date)    │
 *   │   BEGINNER : BARRE 57, powerCycle                        │
 *   │   INTERMEDIATE : CARDIO BARRE, MAT 57, FIT, ...          │
 *   │                                                           │
 *   │   MONDAY              TUESDAY          WEDNESDAY   ...    │ ← day headers
 *   │   7:30 AM  MAT 57 - Reshma    7:15 AM  BARRE 57 - Mrig.. │
 *   │   8:30 AM  powerCycle - Anmol 8:00 AM  powerCycle - ...  │
 *   │   ┌─────────────────────────┐                            │
 *   │   │ 7:30 PM powerCycle - Karanvir (HARRY STYLES) │ ← sold-out orange block
 *   │   └─────────────────────────┘                            │
 *   └───────────────────────────────────────────────────────────┘
 *
 * The styling is driven entirely by doc.theme so chat edits to colours /
 * fonts propagate live without changing the layout.
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

  // Day columns are laid out in a 2×N grid matching the original PDF layout.
  return (
    <div
      className="schedule-doc"
      style={{
        background: t.background,
        color: t.primaryText,
        fontFamily: t.fontFamilyBody,
        width: '100%',
        margin: '0 auto',
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden',
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
        }
        .schedule-class-row:hover {
          background: rgba(0,0,0,0.04) !important;
        }
        .schedule-sold-out {
          text-decoration: line-through;
          text-decoration-color: #dc2626;
          text-decoration-thickness: 2px;
          opacity: 0.95;
        }
      `}</style>

      {/* Lime top band with ticker marquee */}
      {tickerEls.length > 0 && (
        <div style={{ background: t.topBandBg }}>{tickerEls}</div>
      )}

      {/* Header: STUDIO SCHEDULE centered + BANDRA circle badge */}
      <div
        style={{
          position: 'relative',
          textAlign: 'center',
          padding: '32px 24px 16px',
        }}
      >
        {/* Location circle badge — top right */}
        {doc.location && (
          <div
            style={{
              position: 'absolute',
              top: '20px',
              right: '28px',
              width: '110px',
              height: '110px',
              borderRadius: '50%',
              background: t.topBandBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            <span
              style={{
                fontFamily: t.fontFamilyHeading,
                fontSize: '20px',
                fontWeight: 800,
                color: t.primaryText,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                lineHeight: 1.0,
                textAlign: 'center',
              }}
            >
              {doc.location}
            </span>
          </div>
        )}

        <h1
          style={{
            fontFamily: t.fontFamilyHeading,
            fontSize: 'clamp(36px, 5vw, 56px)',
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
              fontSize: 'clamp(22px, 2.6vw, 32px)',
              marginTop: '14px',
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
            padding: '0 24px 18px',
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

      {/* Days grid — matches the original 2×2 (or 2×1) layout per page.
          The original PDF has 4 days per page in a 2×2 grid:
            Mon | Tue       Fri | Sat
            Wed | Thu       Sun |
          We replicate this layout: 2 columns wide, with days flowing top-to-bottom
          then left-to-right. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0',
          padding: '0 24px 32px',
        }}
      >
        {doc.days.map(day => (
          <DayColumn key={day.id} day={day} doc={doc} />
        ))}
      </div>
    </div>
  );
}

function DayColumn({ day, doc }: { day: ScheduleDocument['days'][number]; doc: ScheduleDocument }) {
  const t = doc.theme;
  return (
    <div
      style={{
        padding: '12px 14px 16px',
        borderRight: `1px solid ${t.cardBorder}`,
        minHeight: '120px',
      }}
    >
      <div
        style={{
          fontFamily: t.fontFamilyHeading,
          fontSize: '15px',
          fontWeight: 800,
          color: t.primaryText,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          paddingBottom: '8px',
          marginBottom: '8px',
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
  if (highlight === 'sold-out') {
    bg = t.soldOutBg;
    textColor = t.soldOutText;
    isSoldOut = true;
  } else if (highlight === 'trainer-choice') {
    bg = t.trainerChoiceBg;
    textColor = t.primaryText;
  } else if (highlight === 'custom' && cls.bgColor) {
    bg = cls.bgColor;
    textColor = cls.textColor || t.bodyText;
  }

  return (
    <div
      className="schedule-class-row"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        padding: '3px 6px',
        margin: '0 -6px 1px',
        background: bg,
        borderRadius: highlight !== 'none' ? '3px' : '0',
        position: 'relative',
      }}
    >
      {/* Time */}
      <div
        style={{
          fontFamily: t.fontFamilyBody,
          fontSize: '9.5px',
          fontWeight: 600,
          color: textColor,
          textAlign: 'right',
          width: '62px',
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
          fontSize: '9.5px',
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
              opacity: 0.9,
              marginTop: '1px',
              letterSpacing: '0.08em',
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
