'use client';

import React from 'react';
import { Bold, Italic, AlignLeft, AlignCenter, AlignRight, Trash2, Plus, Minus, Palette } from 'lucide-react';
import { useInlineStore } from '@/lib/inline-store';
import { cn } from '@/lib/utils';

/**
 * Floating toolbar that appears when a span is selected.
 * Lets the user manually change font size, color, bold/italic, alignment,
 * letter spacing, and delete the span.
 */
export function SpanToolbar() {
  const { document, editingSpanId, setSpanStyle, deleteSpan } = useInlineStore();
  if (!document || !editingSpanId) return null;

  let span: any = null;
  for (const page of document.pages) {
    span = page.spans.find(s => s.id === editingSpanId);
    if (span) break;
  }
  if (!span) return null;

  const isBold = span.bold ?? (span.font.toLowerCase().includes('bold') || span.font.toLowerCase().includes('heavy') || span.font.toLowerCase().includes('agrandir'));
  const isItalic = span.italic ?? (span.font.toLowerCase().includes('italic') || span.font.toLowerCase().includes('ivypresto'));
  const align = span.align ?? 'left';

  return (
    <div
      className="flex items-center gap-0.5 bg-zinc-900 dark:bg-zinc-800 text-white rounded-lg shadow-2xl px-1 py-1"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Font size controls */}
      <div className="flex items-center gap-0.5 px-1 border-r border-white/10">
        <button
          onClick={() => setSpanStyle(span.id, { size: Math.max(4, (span.size ?? 9) - 0.5) })}
          className="p-1 rounded hover:bg-white/10 transition-colors"
          title="Decrease font size"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] tabular-nums w-8 text-center">{(span.size ?? 9).toFixed(1)}</span>
        <button
          onClick={() => setSpanStyle(span.id, { size: Math.min(72, (span.size ?? 9) + 0.5) })}
          className="p-1 rounded hover:bg-white/10 transition-colors"
          title="Increase font size"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Color picker */}
      <label className="p-1 rounded hover:bg-white/10 transition-colors cursor-pointer flex items-center" title="Text color">
        <Palette className="w-3.5 h-3.5 mr-1" />
        <input
          type="color"
          value={span.color}
          onChange={(e) => setSpanStyle(span.id, { color: e.target.value })}
          className="w-0 h-0 opacity-0 absolute"
        />
        <span className="w-4 h-4 rounded-sm border border-white/30" style={{ background: span.color }} />
      </label>

      {/* Bold / Italic */}
      <button
        onClick={() => setSpanStyle(span.id, { bold: !isBold })}
        className={cn("p-1.5 rounded transition-colors", isBold ? "bg-emerald-500/30 text-emerald-300" : "hover:bg-white/10")}
        title="Bold"
      >
        <Bold className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => setSpanStyle(span.id, { italic: !isItalic })}
        className={cn("p-1.5 rounded transition-colors", isItalic ? "bg-emerald-500/30 text-emerald-300" : "hover:bg-white/10")}
        title="Italic"
      >
        <Italic className="w-3.5 h-3.5" />
      </button>

      {/* Alignment */}
      <div className="flex items-center gap-0.5 px-1 border-l border-white/10">
        <button
          onClick={() => setSpanStyle(span.id, { align: 'left' })}
          className={cn("p-1.5 rounded transition-colors", align === 'left' ? "bg-emerald-500/30 text-emerald-300" : "hover:bg-white/10")}
          title="Align left"
        >
          <AlignLeft className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setSpanStyle(span.id, { align: 'center' })}
          className={cn("p-1.5 rounded transition-colors", align === 'center' ? "bg-emerald-500/30 text-emerald-300" : "hover:bg-white/10")}
          title="Align center"
        >
          <AlignCenter className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setSpanStyle(span.id, { align: 'right' })}
          className={cn("p-1.5 rounded transition-colors", align === 'right' ? "bg-emerald-500/30 text-emerald-300" : "hover:bg-white/10")}
          title="Align right"
        >
          <AlignRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Letter spacing */}
      <div className="flex items-center gap-0.5 px-1 border-l border-white/10">
        <button
          onClick={() => setSpanStyle(span.id, { letterSpacing: Math.max(-1, (span.letterSpacing ?? 0.01) - 0.1) })}
          className="p-1 rounded hover:bg-white/10 transition-colors"
          title="Decrease letter spacing"
        >
          <span className="text-[10px]">⬅</span>
        </button>
        <span className="text-[9px] tabular-nums w-8 text-center">LS</span>
        <button
          onClick={() => setSpanStyle(span.id, { letterSpacing: Math.min(5, (span.letterSpacing ?? 0.01) + 0.1) })}
          className="p-1 rounded hover:bg-white/10 transition-colors"
          title="Increase letter spacing"
        >
          <span className="text-[10px]">➡</span>
        </button>
      </div>

      {/* Delete */}
      <button
        onClick={() => deleteSpan(span.id)}
        className="p-1.5 rounded hover:bg-red-500/30 text-red-300 transition-colors ml-1 border-l border-white/10"
        title="Delete this text"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
