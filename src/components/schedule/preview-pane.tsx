'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Eye, Edit3, Undo2, Redo2, History, Download, RefreshCw, ChevronLeft, Sparkles, X, MousePointerClick } from 'lucide-react';
import { useInlineStore } from '@/lib/inline-store';
import { InlinePageRenderer } from './inline-renderer';
import { cn } from '@/lib/utils';

interface Props {
  onBackToUpload?: () => void;
}

type ViewMode = 'original' | 'edited' | 'split';

export function PreviewPane({ onBackToUpload }: Props) {
  const { document, previewUrl, history, undo, redo, redoStack, hasUnviewedEdits, markEditsViewed } = useInlineStore();
  const [view, setView] = useState<ViewMode>('edited');
  const [showHistory, setShowHistory] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showEditsToast, setShowEditsToast] = useState(false);
  const [zoom, setZoom] = useState(1.0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hasUnviewedEdits && view === 'original') {
      setShowEditsToast(true);
    }
  }, [hasUnviewedEdits, view]);

  useEffect(() => {
    if (view !== 'original' && hasUnviewedEdits) {
      markEditsViewed();
      setShowEditsToast(false);
    }
  }, [view, hasUnviewedEdits, markEditsViewed]);

  if (!document) return null;

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `schedule-edited.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  const hasEdits = history.length > 0;
  // Display scale: fit the PDF width to ~700px by default, adjustable with zoom
  const baseScale = 700 / document.pages[0].pdfWidth;
  const displayScale = baseScale * zoom;

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      {/* Toolbar */}
      <div className="px-3 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex items-center gap-2 flex-wrap">
        {onBackToUpload && (
          <button
            onClick={onBackToUpload}
            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            title="Upload a different file"
          >
            <ChevronLeft className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
          </button>
        )}

        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800">
          <TogBtn active={view === 'edited'} onClick={() => setView('edited')} icon={Edit3} label="Edit" sublabel="Inline" />
          <TogBtn active={view === 'original'} onClick={() => setView('original')} icon={Eye} label="Original" sublabel="Uploaded" pulse={hasUnviewedEdits && view === 'edited'} />
          <TogBtn active={view === 'split'} onClick={() => setView('split')} icon={Eye} label="Split" hideOnMobile />
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1 ml-1">
          <button
            onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
            className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-sm font-mono"
            title="Zoom out"
          >
            −
          </button>
          <span className="text-[11px] text-zinc-500 tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom(z => Math.min(2.0, z + 0.1))}
            className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-sm font-mono"
            title="Zoom in"
          >
            +
          </button>
        </div>

        <div className="flex-1" />

        <button
          onClick={undo}
          disabled={history.length === 0}
          className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Undo"
        >
          <Undo2 className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
        </button>
        <button
          onClick={redo}
          disabled={redoStack.length === 0}
          className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Redo"
        >
          <Redo2 className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
        </button>

        <button
          onClick={() => setShowHistory(s => !s)}
          className={cn(
            "p-1.5 rounded-lg transition-colors",
            showHistory ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
          )}
          title="History"
        >
          <History className="w-4 h-4" />
        </button>

        <button
          onClick={handleExport}
          disabled={exporting}
          className="px-2.5 py-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-xs font-medium hover:shadow-lg hover:shadow-emerald-500/20 disabled:opacity-50 transition-all flex items-center gap-1.5"
        >
          {exporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">Export PDF</span>
        </button>
      </div>

      {/* Inline-edit hint banner */}
      {view === 'edited' && (
        <div className="px-4 py-1.5 bg-emerald-50 dark:bg-emerald-950/30 border-b border-emerald-100 dark:border-emerald-900/50 flex items-center gap-2 text-[11px] text-emerald-700 dark:text-emerald-300">
          <MousePointerClick className="w-3.5 h-3.5" />
          <span>Click any text in the schedule to edit it directly. Press Enter to save, Esc to cancel.</span>
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 flex min-h-0 relative">
        <div ref={scrollRef} className={cn("flex-1 overflow-auto min-h-0", showHistory && "lg:flex-[3]")}>
          {view === 'edited' && (
            <div className="min-h-full p-4 lg:p-6 flex flex-col items-center gap-4">
              {document.pages.map(page => (
                <InlinePageRenderer key={page.index} page={page} displayScale={displayScale} />
              ))}
            </div>
          )}
          {view === 'original' && (
            <div className="min-h-full p-4 lg:p-6 flex flex-col items-center gap-4">
              {document.pages.map((page, i) => (
                <img
                  key={i}
                  src={previewUrl && i === 0 ? previewUrl : page.backgroundImage}
                  alt={`Page ${i + 1}`}
                  className="rounded-lg shadow-xl border border-zinc-200 dark:border-zinc-800"
                  style={{ width: `${page.pdfWidth * displayScale}px` }}
                />
              ))}
            </div>
          )}
          {view === 'split' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 h-full min-h-0">
              <div className="flex flex-col min-h-0">
                <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide mb-2">Original</div>
                <div className="flex-1 overflow-auto rounded-lg bg-zinc-100/50 dark:bg-zinc-900/50 p-3 min-h-0">
                  {document.pages.map((page, i) => (
                    <img
                      key={i}
                      src={previewUrl && i === 0 ? previewUrl : page.backgroundImage}
                      alt={`Original ${i + 1}`}
                      className="w-full h-auto rounded-md shadow-md mb-3"
                    />
                  ))}
                </div>
              </div>
              <div className="flex flex-col min-h-0">
                <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide mb-2">Edited (click to edit)</div>
                <div className="flex-1 overflow-auto rounded-lg bg-zinc-100/50 dark:bg-zinc-900/50 p-3 min-h-0 flex flex-col items-center gap-3">
                  {document.pages.map(page => (
                    <InlinePageRenderer key={page.index} page={page} displayScale={displayScale * 0.85} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {showEditsToast && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2.5 pl-3 pr-2 py-2 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-xl text-xs font-medium">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-600" />
            <span>Edits applied — switch to Edit view to see them</span>
            <button
              onClick={() => setView('edited')}
              className="ml-1 px-2.5 py-1 rounded-full bg-emerald-500 text-white text-[11px] font-semibold hover:bg-emerald-600"
            >
              View
            </button>
            <button
              onClick={() => { setShowEditsToast(false); markEditsViewed(); }}
              className="p-1 rounded-full hover:bg-white/10 dark:hover:bg-black/10"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {showHistory && (
          <div className="w-64 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-y-auto">
            <div className="px-3 py-2.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">History</span>
              <span className="text-[10px] text-zinc-500">{history.length}</span>
            </div>
            <div className="p-2 space-y-1">
              {history.length === 0 ? (
                <p className="text-xs text-zinc-500 italic px-2 py-4 text-center">No edits yet</p>
              ) : (
                history.map(h => (
                  <div key={h.id} className="text-xs px-2.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                    <p className="text-zinc-700 dark:text-zinc-200 font-medium">{h.summary}</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">{new Date(h.ts).toLocaleTimeString()}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TogBtn({
  active, onClick, icon: Icon, label, sublabel, pulse, hideOnMobile,
}: {
  active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>;
  label: string; sublabel?: string; pulse?: boolean; hideOnMobile?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all",
        hideOnMobile && "hidden md:flex",
        active ? "bg-white dark:bg-zinc-950 text-emerald-700 dark:text-emerald-300 shadow-sm" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      <span className="flex flex-col items-start leading-tight">
        <span>{label}</span>
        {sublabel && <span className="text-[9px] opacity-70 -mt-0.5">{sublabel}</span>}
      </span>
      {pulse && (
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 animate-pulse ring-2 ring-white dark:ring-zinc-950" />
      )}
    </button>
  );
}
