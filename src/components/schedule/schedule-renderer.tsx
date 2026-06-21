'use client';

import React, { useMemo } from 'react';
import type { ScheduleDocument, ScheduleClass } from '@/lib/schedule-types';

interface Props {
  doc: ScheduleDocument;
  /** When true, render in dark mode (e.g. for the surrounding page). */
  onPage?: boolean;
}

/**
 * ScheduleRenderer renders a ScheduleDocument as HTML that visually matches
 * the original uploaded poster (two marquee ticker bands across the top,
 * big STUDIO SCHEDULE title, location, italic date, level rows, 7-column
 * day grid with time + class rows).
 *
 * The styling is driven entirely by doc.theme so chat edits to colours /
 * fonts propagate live without changing the layout.
 */
export function ScheduleRenderer({ doc, onPage = false }: Props) {
  const t = doc.theme;

  // Build the marquee text — repeat each band's text to fill the width
  const tickerEls = useMemo(() => {
    return doc.tickerBands.map((band, idx) => {
      const single = band.text + ' • ';
      // Repeat enough times to overflow a wide row
      const repeated = single.repeat(40).trim();
      return (
        <div
          key={band.id || `band-${idx}`}
          className="schedule-marquee"
          style={{
            color: band.textColor,
            background: band.bgColor === 'transparent' ? 'transparent' : band.bgColor,
            fontSize: `${band.fontSize}px`,
            fontStyle: band.italic ? 'italic' : 'normal',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            padding: '2px 0',
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
  }, [doc.tickerBands]);

  return (
    <div
      className="schedule-doc"
      style={{
        background: t.background,
        color: t.primaryText,
        fontFamily: t.fontFamilyBody,
        width: '100%',
        maxWidth: '1100px',
        margin: '0 auto',
        padding: '24px 28px 32px',
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
        .schedule-day-card {
          transition: transform .18s ease, box-shadow .18s ease;
        }
        .schedule-day-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 24px rgba(0,0,0,0.08);
        }
        .schedule-class-row {
          transition: background .15s ease;
          border-radius: 4px;
        }
        .schedule-class-row:hover {
          background: rgba(0,0,0,0.04);
        }
      `}</style>

      {/* Ticker bands */}
      {tickerEls.length > 0 && (
        <div style={{ marginBottom: '8px' }}>{tickerEls}</div>
      )}

      {/* Title block */}
      <div style={{ textAlign: 'center', margin: '20px 0 16px' }}>
        <h1
          style={{
            fontFamily: t.fontFamilyHeading,
            fontSize: 'clamp(28px, 4vw, 44px)',
            lineHeight: 1.0,
            margin: 0,
            color: t.primaryText,
            letterSpacing: '-0.01em',
            fontWeight: 800,
            textTransform: 'uppercase',
          }}
        >
          {doc.studioName}
        </h1>
        {doc.location && (
          <div
            style={{
              fontFamily: t.fontFamilyHeading,
              fontSize: 'clamp(18px, 2.2vw, 26px)',
              marginTop: '6px',
              color: t.primaryText,
              fontWeight: 700,
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
            }}
          >
            {doc.location}
          </div>
        )}
        {doc.dateRange && (
          <div
            style={{
              fontFamily: t.fontFamilyDisplay,
              fontStyle: 'italic',
              fontSize: 'clamp(20px, 2.4vw, 30px)',
              marginTop: '10px',
              color: t.accent,
              fontWeight: 700,
            }}
          >
            {doc.dateRange}
          </div>
        )}
        {doc.tagline && (
          <div
            style={{
              fontFamily: t.fontFamilyBody,
              fontSize: '10px',
              color: t.mutedText,
              marginTop: '6px',
              letterSpacing: '0.12em',
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
            marginBottom: '18px',
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
                letterSpacing: '0.02em',
              }}
            >
              <span style={{ fontWeight: 700 }}>{row.level}</span>
              <span style={{ opacity: 0.85 }}> : {row.classes.join(', ')}</span>
            </div>
          ))}
        </div>
      )}

      {/* Days grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
        }}
      >
        {doc.days.map(day => (
          <DayCard key={day.id} day={day} doc={doc} />
        ))}
      </div>

      {onPage && (
        <div
          style={{
            marginTop: '20px',
            textAlign: 'center',
            fontSize: '10px',
            color: t.mutedText,
            opacity: 0.7,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          {doc.studioName} · {doc.location}
        </div>
      )}
    </div>
  );
}

function DayCard({ day, doc }: { day: ScheduleDocument['days'][number]; doc: ScheduleDocument }) {
  const t = doc.theme;
  return (
    <div
      className="schedule-day-card"
      style={{
        background: t.cardBg,
        border: `1px solid ${t.cardBorder}`,
        borderRadius: '8px',
        padding: '12px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      }}
    >
      <div
        style={{
          fontFamily: t.fontFamilyHeading,
          fontSize: '13px',
          fontWeight: 800,
          color: t.primaryText,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          paddingBottom: '6px',
          borderBottom: `1.5px solid ${t.primaryText}`,
          marginBottom: '2px',
        }}
      >
        {day.name}
      </div>
      {day.classes.length === 0 ? (
        <div
          style={{
            fontSize: '10px',
            color: t.mutedText,
            opacity: 0.5,
            fontStyle: 'italic',
            padding: '6px 0',
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
  const bandColor = t.bandColors[cls.level] || t.accent;
  return (
    <div
      className="schedule-class-row"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '6px',
        padding: '4px 4px',
        position: 'relative',
      }}
    >
      {/* Color band on the left */}
      <div
        style={{
          width: '3px',
          alignSelf: 'stretch',
          background: bandColor,
          borderRadius: '2px',
          flexShrink: 0,
          minHeight: '28px',
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: t.fontFamilyBody,
            fontSize: '10px',
            fontWeight: 700,
            color: t.primaryText,
            lineHeight: 1.1,
          }}
        >
          {cls.time}
        </div>
        <div
          style={{
            fontFamily: t.fontFamilyBody,
            fontSize: '10px',
            color: t.bodyText,
            lineHeight: 1.25,
            marginTop: '1px',
            wordBreak: 'break-word',
          }}
        >
          <span style={{ fontWeight: 600 }}>{cls.className}</span>
          {cls.instructor && (
            <span style={{ opacity: 0.8 }}> — {cls.instructor}</span>
          )}
        </div>
      </div>
    </div>
  );
}
