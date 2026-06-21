'use client';

import React, { useEffect, useState } from 'react';
import { Eye, Edit3, Columns2, Undo2, Redo2, History, Download, RefreshCw, ChevronLeft, Sparkles, X } from 'lucide-react';
import { useScheduleStore } from '@/lib/schedule/store';
import { ScheduleRenderer } from './schedule-renderer';
import { cn } from '@/lib/utils';

interface Props {
  onBackToUpload?: () => void;
}

type ViewMode = 'original' | 'edited' | 'split' | 'compare';

export function PreviewPane({ onBackToUpload }: Props) {
  const { original, current, previewUrl, history, undo, redo, redoStack, hasUnviewedEdits, markEditsViewed } = useScheduleStore();
  // Default to 'original' — the uploaded document is shown full-size next to
  // the chat, exactly as the user requested.
  const [view, setView] = useState<ViewMode>('original');
  const [showHistory, setShowHistory] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showEditsToast, setShowEditsToast] = useState(false);

  // When edits arrive and the user is currently viewing the original, show a
  // non-intrusive toast prompting them to switch to the Edited view. We do
  // NOT auto-switch — that would be jarring.
  useEffect(() => {
    if (hasUnviewedEdits && view === 'original') {
      setShowEditsToast(true);
    }
  }, [hasUnviewedEdits, view]);

  // Whenever the user manually switches to "edited" or "split" or "compare",
  // mark edits as viewed.
  useEffect(() => {
    if (view !== 'original' && hasUnviewedEdits) {
      markEditsViewed();
      setShowEditsToast(false);
    }
  }, [view, hasUnviewedEdits, markEditsViewed]);

  if (!current) return null;

  const handleExport = async () => {
    if (!current) return;
    setExporting(true);
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: current }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${current.location || 'schedule'}-${current.dateRange || 'edited'}.pdf`.replace(/\s+/g, '_');
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  const hasEdits = history.length > 0;

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

        {/* View toggle — primary navigation */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800">
          <TogBtn
            active={view === 'original'}
            onClick={() => setView('original')}
            icon={Eye}
            label="Original"
            sublabel="Uploaded"
          />
          <TogBtn
            active={view === 'edited'}
            onClick={() => setView('edited')}
            icon={Edit3}
            label="Edited"
            sublabel={hasEdits ? 'Live' : 'No edits'}
            pulse={hasUnviewedEdits && view === 'original'}
          />
          <TogBtn
            active={view === 'split'}
            onClick={() => setView('split')}
            icon={Columns2}
            label="Split"
            hideOnMobile
          />
          <TogBtn
            active={view === 'compare'}
            onClick={() => setView('compare')}
            icon={Sparkles}
            label="Compare"
            hideOnMobile
          />
        </div>

        <div className="flex-1" />

        {/* Undo/Redo */}
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

      {/* Content area — single full-size preview by default */}
      <div className="flex-1 flex min-h-0 relative">
        <div className={cn("flex-1 overflow-auto min-h-0", showHistory && "lg:flex-[3]")}>
          {view === 'original' && (
            <OriginalView previewUrl={previewUrl} original={original} />
          )}
          {view === 'edited' && (
            <EditedView current={current} />
          )}
          {view === 'split' && (
            <SplitView previewUrl={previewUrl} original={original} current={current} />
          )}
          {view === 'compare' && (
            <CompareView previewUrl={previewUrl} original={original} current={current} />
          )}
        </div>

        {/* Edits toast — non-intrusive prompt to view live edits */}
        {showEditsToast && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2.5 pl-3 pr-2 py-2 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-xl text-xs font-medium animate-in fade-in slide-in-from-bottom-2">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-600" />
            <span>Edits applied — see them live</span>
            <button
              onClick={() => setView('edited')}
              className="ml-1 px-2.5 py-1 rounded-full bg-emerald-500 text-white text-[11px] font-semibold hover:bg-emerald-600 transition-colors"
            >
              View
            </button>
            <button
              onClick={() => { setShowEditsToast(false); markEditsViewed(); }}
              className="p-1 rounded-full hover:bg-white/10 dark:hover:bg-black/10"
              aria-label="Dismiss"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* History sidebar */}
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
                  <div key={h.id} className="text-xs px-2.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                    <p className="text-zinc-700 dark:text-zinc-200 font-medium truncate">
                      {h.summary || 'Edit'}
                    </p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      {new Date(h.ts).toLocaleTimeString()}
                    </p>
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

// =============== Views ===============

function OriginalView({ previewUrl, original }: { previewUrl: string | null; original: any }) {
  // Prefer the raw uploaded image (PDF rendered to PNG, or the image itself).
  // Fall back to the parsed-then-rendered schedule if no preview is available.
  if (previewUrl) {
    return (
      <div className="min-h-full flex items-start justify-center p-4 lg:p-8">
        <img
          src={previewUrl}
          alt="Uploaded schedule"
          className="w-auto max-w-full max-h-full rounded-lg shadow-2xl shadow-zinc-300/40 dark:shadow-black/40 border border-zinc-200 dark:border-zinc-800"
          style={{ objectFit: 'contain' }}
        />
      </div>
    );
  }
  if (original) {
    return (
      <div className="min-h-full p-4 lg:p-8">
        <div className="max-w-5xl mx-auto shadow-2xl shadow-zinc-300/40 dark:shadow-black/40 rounded-lg overflow-hidden">
          <ScheduleRenderer doc={original} onPage />
        </div>
      </div>
    );
  }
  return <Empty>No original preview available</Empty>;
}

function EditedView({ current }: { current: any }) {
  return (
    <div className="min-h-full p-4 lg:p-8 bg-zinc-100/40 dark:bg-zinc-900/40">
      <div className="max-w-5xl mx-auto shadow-2xl shadow-emerald-200/40 dark:shadow-black/40 rounded-lg overflow-hidden ring-1 ring-emerald-200/40 dark:ring-emerald-800/40">
        <ScheduleRenderer doc={current} onPage />
      </div>
    </div>
  );
}

function SplitView({ previewUrl, original, current }: { previewUrl: string | null; original: any; current: any }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 h-full min-h-0">
      <PreviewColumn title="Original" badge="Source">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Original schedule"
            className="w-full h-auto rounded-lg shadow-md border border-zinc-200 dark:border-zinc-800"
          />
        ) : original ? (
          <ScheduleRenderer doc={original} onPage />
        ) : (
          <Empty>No original preview available</Empty>
        )}
      </PreviewColumn>
      <PreviewColumn title="Edited" badge="Live" highlight>
        <ScheduleRenderer doc={current} onPage />
      </PreviewColumn>
    </div>
  );
}

function CompareView({ previewUrl, original, current }: { previewUrl: string | null; original: any; current: any }) {
  // Vertical stack: original on top, edited below — both at full width so
  // the user can scroll between them naturally.
  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">Original</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 font-medium">Source</span>
        </div>
        <div className="rounded-lg overflow-hidden shadow-xl border border-zinc-200 dark:border-zinc-800">
          {previewUrl ? (
            <img src={previewUrl} alt="Original" className="w-full h-auto" />
          ) : original ? (
            <ScheduleRenderer doc={original} onPage />
          ) : (
            <Empty>No original preview available</Empty>
          )}
        </div>
      </div>
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">Edited</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 font-medium">Live</span>
        </div>
        <div className="rounded-lg overflow-hidden shadow-xl ring-1 ring-emerald-200/40 dark:ring-emerald-800/40">
          <ScheduleRenderer doc={current} onPage />
        </div>
      </div>
    </div>
  );
}

// =============== Helpers ===============

function TogBtn({
  active,
  onClick,
  icon: Icon,
  label,
  sublabel,
  pulse,
  hideOnMobile,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sublabel?: string;
  pulse?: boolean;
  hideOnMobile?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all",
        hideOnMobile && "hidden md:flex",
        active
          ? "bg-white dark:bg-zinc-950 text-emerald-700 dark:text-emerald-300 shadow-sm"
          : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
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

function PreviewColumn({ title, badge, highlight, children }: { title: string; badge: string; highlight?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">{title}</span>
        <span
          className={cn(
            "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
            highlight
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
              : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
          )}
        >
          {badge}
        </span>
      </div>
      <div className="flex-1 overflow-auto rounded-lg bg-zinc-100/50 dark:bg-zinc-900/50 p-3 min-h-0">
        {children}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center h-full text-sm text-zinc-400 italic">
      {children}
    </div>
  );
}
