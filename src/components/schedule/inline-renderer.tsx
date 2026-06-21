'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useInlineStore } from '@/lib/inline-store';
import { mapPdfFont } from '@/lib/font-map';
import type { TextSpan, SchedulePage } from '@/lib/inline-types';
import { SpanToolbar } from './span-toolbar';
import { cn } from '@/lib/utils';

interface Props {
  page: SchedulePage;
  displayScale: number;
}

export function InlinePageRenderer({ page, displayScale }: Props) {
  const { document, editingSpanId, startEditing, stopEditing, setSpanTextDirect, setSpanText } = useInlineStore();

  if (!document) return null;

  const cssWidth = page.pdfWidth * displayScale;
  const cssHeight = page.pdfHeight * displayScale;

  return (
    <div
      className="relative inline-block shadow-lg"
      style={{ width: `${cssWidth}px`, height: `${cssHeight}px`, background: '#ffffff' }}
    >
      <img
        src={page.backgroundImage}
        alt={`Page ${page.index + 1}`}
        className="absolute inset-0 w-full h-full select-none"
        style={{ pointerEvents: 'none' }}
        draggable={false}
      />
      {page.spans.filter(s => !s.hidden).map(span => (
        <EditableSpan
          key={span.id}
          span={span}
          displayScale={displayScale}
          isEditing={editingSpanId === span.id}
          isSelected={editingSpanId === span.id}
          onStartEdit={() => startEditing(span.id)}
          onStopEdit={(newText) => {
            if (newText !== span.text) setSpanText(span.id, newText, page.index);
            stopEditing();
          }}
          onTextChange={(newText) => setSpanTextDirect(span.id, newText)}
        />
      ))}
      {/* Floating toolbar for the currently-selected span */}
      {editingSpanId && (
        <SpanToolbarWrapper page={page} displayScale={displayScale} />
      )}
    </div>
  );
}

/** Wrapper that positions the toolbar near the selected span. */
function SpanToolbarWrapper({ page, displayScale }: { page: SchedulePage; displayScale: number }) {
  const { document, editingSpanId } = useInlineStore();
  if (!document || !editingSpanId) return null;
  const span = page.spans.find(s => s.id === editingSpanId);
  if (!span) return null;
  const left = span.x * displayScale;
  const top = span.y * displayScale;
  // Position toolbar above the span (or below if near top)
  const toolbarTop = top > 50 ? top - 44 : top + (span.h * displayScale) + 6;
  return (
    <div
      style={{
        position: 'absolute',
        left: `${left}px`,
        top: `${toolbarTop}px`,
        zIndex: 100,
      }}
    >
      <SpanToolbar />
    </div>
  );
}

function EditableSpan({
  span, displayScale, isEditing, isSelected, onStartEdit, onStopEdit, onTextChange,
}: {
  span: TextSpan;
  displayScale: number;
  isEditing: boolean;
  isSelected: boolean;
  onStartEdit: () => void;
  onStopEdit: (text: string) => void;
  onTextChange: (text: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fontMap = mapPdfFont(span.font, span.size);

  // Apply user style overrides
  const fontSize = (span.size ?? fontMap.fontSize) * displayScale;
  const fontWeight = span.bold !== undefined
    ? (span.bold ? 800 : 400)
    : fontMap.fontWeight;
  const fontStyle = span.italic !== undefined
    ? (span.italic ? 'italic' : 'normal')
    : fontMap.fontStyle;
  const color = span.color;
  const letterSpacing = span.letterSpacing !== undefined ? `${span.letterSpacing}px` : '0.01em';

  // Base position
  let left = span.x * displayScale;
  let top = span.y * displayScale;
  let width = (span.x2 - span.x) * displayScale;
  let height = (span.y2 - span.y) * displayScale;
  let transform: string | undefined;

  // For rotated spans (side borders), we need to rotate the element.
  // The PDF bbox for rotated text is the bounding box of the rotated text.
  // dir=(0,-1) means text reads bottom-to-top (rotated -90°)
  // dir=(0,1) means text reads top-to-bottom (rotated +90°)
  if (span.rotation === -90) {
    // Text reads upward (bottom to top). The bbox width is the text height,
    // bbox height is the text length. We rotate -90° around the top-left corner.
    transform = 'rotate(-90deg)';
    transform += ' translate(-100%, 0)';
    // After rotation, swap width/height
    [width, height] = [height, width];
  } else if (span.rotation === 90) {
    transform = 'rotate(90deg)';
    transform += ' translate(0, -100%)';
    [width, height] = [height, width];
  }

  // Alignment
  const textAlign = span.align ?? 'left';

  useEffect(() => {
    if (isEditing && ref.current) {
      ref.current.focus();
      const range = document.createRange();
      range.selectNodeContents(ref.current);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [isEditing]);

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
        e.stopPropagation();
        if (!isEditing) onStartEdit();
      }}
      style={{
        position: 'absolute',
        left: `${left}px`,
        top: `${top}px`,
        minWidth: `${Math.max(width, 4)}px`,
        height: `${Math.max(height, fontSize * 1.1)}px`,
        fontFamily: fontMap.fontFamily,
        fontSize: `${fontSize}px`,
        fontWeight,
        fontStyle,
        color,
        lineHeight: 1.0,
        letterSpacing,
        whiteSpace: isTicker ? 'nowrap' : 'pre',
        overflow: 'hidden',
        textAlign,
        transform,
        transformOrigin: 'top left',
        cursor: isEditing ? 'text' : 'pointer',
        outline: isSelected ? '1.5px solid #3b82f6' : 'none',
        outlineOffset: '1px',
        background: isEditing ? 'rgba(59, 130, 246, 0.06)' : 'transparent',
        borderRadius: '2px',
        padding: '0',
        margin: '0',
        boxSizing: 'border-box',
        userSelect: isEditing ? 'text' : 'none',
        zIndex: isEditing ? 10 : 2,
        transition: 'outline 0.1s',
      }}
      title={isEditing ? 'Enter to save · Esc to cancel' : 'Click to edit'}
    >
      {span.text}
    </div>
  );
}
