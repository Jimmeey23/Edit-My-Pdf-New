'use client';

import React, { useCallback, useRef, useState } from 'react';
import { Upload, FileText, Loader2, X } from 'lucide-react';
import { useInlineStore } from '@/lib/inline-store';
import { cn } from '@/lib/utils';

export function UploadZone() {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { setParsing, loadDocument, parseError, isParsing } = useInlineStore();

  const handleFile = useCallback(async (file: File) => {
    setParsing(true, null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/parse', { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || 'Upload failed');
      }
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Parse failed');
      loadDocument(data.document, data.preview);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setParsing(false, msg);
    }
  }, [loadDocument, setParsing]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="w-full">
      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "relative cursor-pointer rounded-2xl border-2 border-dashed transition-all",
          "flex flex-col items-center justify-center text-center p-10 min-h-[280px]",
          isDragging
            ? "border-emerald-400 bg-emerald-50 scale-[1.01]"
            : "border-zinc-300 dark:border-zinc-700 hover:border-emerald-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
          className="hidden"
        />

        {isParsing ? (
          <>
            <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mb-4" />
            <p className="text-base font-medium text-zinc-700 dark:text-zinc-200">
              Loading your schedule…
            </p>
            <p className="text-sm text-zinc-500 mt-1">
              Extracting text spans for inline editing
            </p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/20">
              <Upload className="w-7 h-7 text-white" />
            </div>
            <p className="text-base font-semibold text-zinc-800 dark:text-zinc-100">
              Drop your schedule PDF here
            </p>
            <p className="text-sm text-zinc-500 mt-1">
              or click to browse
            </p>
            <div className="flex items-center gap-4 mt-5 text-xs text-zinc-500">
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> PDF only (for inline editing)
              </span>
            </div>
          </>
        )}
      </div>

      {parseError && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          <X className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{parseError}</span>
        </div>
      )}
    </div>
  );
}
