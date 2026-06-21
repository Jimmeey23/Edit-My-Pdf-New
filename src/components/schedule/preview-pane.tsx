'use client';

import React, { useState } from 'react';
import { Eye, Edit3, Columns2, Undo2, Redo2, History, Download, RefreshCw, ChevronLeft } from 'lucide-react';
import { useScheduleStore } from '@/lib/schedule/store';
import { ScheduleRenderer } from './schedule-renderer';
import { cn } from '@/lib/utils';

interface Props {
  onBackToUpload?: () => void;
}

export function PreviewPane({ onBackToUpload }: Props) {
  const { original, current, previewUrl, history, undo, redo, redoStack } = useScheduleStore();
  const [view, setView] = useState<'split' | 'edited' | 'original'>('split');
  const [showHistory, setShowHistory] = useState(false);
  const [exporting, setExporting] = useState(false);

  if (!current) return null;

  const handleExport = async () => {
    if (!current) return;
    setExporting(true);
    try {
      // Render the current schedule HTML to a PDF via the export endpoint
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

        {/* View toggle */}
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800">
          <TogBtn active={view === 'split'} onClick={() => setView('split')} icon={Columns2} label="Split" />
          <TogBtn active={view === 'edited'} onClick={() => setView('edited')} icon={Edit3} label="Edited" />
          <TogBtn active={view === 'original'} onClick={() => setView('original')} icon={Eye} label="Original" />
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
          <span>Export PDF</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex min-h-0">
        <div
          className={cn(
            "flex-1 overflow-auto p-4",
            view === 'split' && showHistory && "lg:flex-[3]",
          )}
        >
          {view === 'split' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
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
                <div className="origin-top">
                  <ScheduleRenderer doc={current} onPage />
                </div>
              </PreviewColumn>
            </div>
          ) : view === 'edited' ? (
            <div className="max-w-5xl mx-auto">
              <ScheduleRenderer doc={current} onPage />
            </div>
          ) : (
            <div className="max-w-5xl mx-auto">
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
            </div>
          )}
        </div>

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

function TogBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all",
        active
          ? "bg-white dark:bg-zinc-950 text-emerald-700 dark:text-emerald-300 shadow-sm"
          : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
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
