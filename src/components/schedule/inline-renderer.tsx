'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useInlineStore } from '@/lib/inline-store';
import { mapPdfFont } from '@/lib/font-map';
import type { TextSpan, SchedulePage } from '@/lib/inline-types';
import { cn } from '@/lib/utils';

interface Props {
  page: SchedulePage;
  /** Display scale — the background image is rendered at `page.scale` (e.g. 2.5x).
   * We display it at a CSS size of `page.pdfWidth * displayScale` pt, and position
   * each span at `span.x * displayScale` etc. */
  displayScale: number;
}

/**
 * InlinePageRenderer renders a single page as:
 *   1. A background <img> (the original PDF page with text redacted)
 *   2. Absolutely-positioned <span contentEditable> overlays for each text span,
 *      placed at the span's exact (x, y) position with the same font/size/color.
 *
 * Clicking a span makes it editable. Typing updates the span's text in the store.
 * The background never changes — only the text content changes. This guarantees
 * the document ALWAYS looks identical to the original.
 */
export function InlinePageRenderer({ page, displayScale }: Props) {
  const { document, editingSpanId, startEditing, stopEditing, setSpanTextDirect, setSpanText } = useInlineStore();
  const containerRef = useRef<HTMLDivElement>(null);

  if (!document) return null;

  // CSS display dimensions
  const cssWidth = page.pdfWidth * displayScale;
  const cssHeight = page.pdfHeight * displayScale;

  return (
    <div
      ref={containerRef}
      className="relative inline-block shadow-lg"
      style={{
        width: `${cssWidth}px`,
        height: `${cssHeight}px`,
        background: '#ffffff',
      }}
    >
      {/* Background image (text-redacted original PDF page) */}
      <img
        src={page.backgroundImage}
        alt={`Page ${page.index + 1}`}
        className="absolute inset-0 w-full h-full select-none"
        style={{ pointerEvents: 'none' }}
        draggable={false}
      />

      {/* Editable text span overlays */}
      {page.spans.map(span => (
        <EditableSpan
          key={span.id}
          span={span}
          displayScale={displayScale}
          isEditing={editingSpanId === span.id}
          onStartEdit={() => startEditing(span.id)}
          onStopEdit={(newText) => {
            if (newText !== span.text) {
              setSpanText(span.id, newText, page.index);
            }
            stopEditing();
          }}
          onTextChange={(newText) => setSpanTextDirect(span.id, newText)}
        />
      ))}
    </div>
  );
}

function EditableSpan({
  span,
  displayScale,
  isEditing,
  onStartEdit,
  onStopEdit,
  onTextChange,
}: {
  span: TextSpan;
  displayScale: number;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: (text: string) => void;
  onTextChange: (text: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fontMap = mapPdfFont(span.font, span.size);

  // Position and size in CSS pixels
  const left = span.x * displayScale;
  const top = span.y * displayScale;
  const width = (span.x2 - span.x) * displayScale;
  const height = (span.y2 - span.y) * displayScale;
  const fontSize = span.size * displayScale;

  // Focus when entering edit mode
  useEffect(() => {
    if (isEditing && ref.current) {
      ref.current.focus();
      // Select all text
      const range = document.createRange();
      range.selectNodeContents(ref.current);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [isEditing]);

  // Determine if this span is a long ticker/marquee text (very wide) — if so,
  // clip it to the page width and don't let editing expand it.
  const isTicker = width > 400 && (span.font.toLowerCase().includes('sweet') || span.text.includes('•'));

  const handleBlur = useCallback(() => {
    const newText = ref.current?.innerText?.replace(/\n/g, ' ').trim() || '';
    onStopEdit(newText);
  }, [onStopEdit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      (e.target as HTMLElement).blur();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      // Restore original
      if (ref.current) ref.current.innerText = span.text;
      (e.target as HTMLElement).blur();
    }
  }, [span.text]);

  return (
    <div
      ref={ref}
      contentEditable={isEditing}
      suppressContentEditableWarning
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onClick={(e) => {
        if (!isEditing) {
          e.stopPropagation();
          onStartEdit();
        }
      }}
      onMouseDown={(e) => {
        // Prevent text selection when not in edit mode (so clicking doesn't
        // interfere with scrolling)
        if (!isEditing) {
          // Allow the click to start editing
        }
      }}
      style={{
        position: 'absolute',
        left: `${left}px`,
        top: `${top}px`,
        minWidth: `${Math.max(width, 4)}px`,
        height: `${Math.max(height, fontSize * 1.1)}px`,
        fontFamily: fontMap.fontFamily,
        fontSize: `${fontSize}px`,
        fontWeight: fontMap.fontWeight,
        fontStyle: fontMap.fontStyle,
        color: span.color,
        lineHeight: 1.0,
        letterSpacing: '0.01em',
        whiteSpace: isTicker ? 'nowrap' : 'pre',
        overflow: 'hidden',
        textOverflow: isTicker ? 'clip' : 'clip',
        cursor: isEditing ? 'text' : 'pointer',
        outline: isEditing ? '1.5px solid #3b82f6' : 'none',
        outlineOffset: '1px',
        background: isEditing ? 'rgba(59, 130, 246, 0.06)' : 'transparent',
        borderRadius: '2px',
        padding: '0',
        margin: '0',
        boxSizing: 'border-box',
        userSelect: isEditing ? 'text' : 'none',
        zIndex: isEditing ? 10 : 2,
        transition: 'background 0.1s, outline 0.1s',
      }}
      title={isEditing ? 'Press Enter to save, Esc to cancel' : 'Click to edit'}
    >
      {span.text}
    </div>
  );
}
