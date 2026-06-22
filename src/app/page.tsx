'use client';

import React, { useEffect } from 'react';
import { CalendarClock, Sparkles, Wand2, MousePointerClick, MessageSquareText, Edit3 } from 'lucide-react';
import { useInlineStore } from '@/lib/inline-store';
import { UploadZone } from '@/components/schedule/upload-zone';
import { PreviewPane } from '@/components/schedule/preview-pane';
import { ChatPanel } from '@/components/schedule/chat-panel';

export default function Home() {
  const { document: doc, reset } = useInlineStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (e.target as HTMLElement)?.tagName === 'INPUT') {
        (e.target as HTMLInputElement).blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-zinc-50 via-violet-50/30 to-purple-50/40 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <CalendarClock className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-50 leading-tight">
              Schedule Studio
            </h1>
            <p className="text-[11px] text-zinc-500 leading-tight">
              Upload · Click to edit inline · Chat to change text
            </p>
          </div>

          {doc && (
            <button
              onClick={() => { if (confirm('Discard current schedule and upload a new one?')) reset(); }}
              className="text-xs px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 transition-colors"
            >
              New upload
            </button>
          )}

          <div className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-500">
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            <span>powered by GPT-4.1</span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 lg:px-6 py-4 lg:py-6">
        {!doc ? (
          <LandingScreen />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_380px] gap-4 lg:gap-5 h-[calc(100vh-120px)] min-h-[600px]">
            <div className="min-h-0">
              <PreviewPane onBackToUpload={() => { if (confirm('Discard current schedule and upload a new one?')) reset(); }} />
            </div>
            <div className="min-h-0 h-[600px] lg:h-auto">
              <ChatPanel />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function LandingScreen() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_440px] gap-6 lg:gap-8 max-w-6xl mx-auto pt-6 lg:pt-10">
      <div className="space-y-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 text-[11px] font-medium mb-3">
            <Wand2 className="w-3 h-3" />
            Inline schedule editor
          </div>
          <h2 className="text-3xl lg:text-4xl font-bold text-zinc-900 dark:text-zinc-50 leading-tight">
            Upload your schedule PDF.<br />
            <span className="bg-gradient-to-r from-violet-500 to-purple-600 bg-clip-text text-transparent">
              Edit the text right on top of it.
            </span>
          </h2>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400 max-w-xl">
            We show your exact PDF as a background and let you click any text to edit it
            directly — or tell the chat bot what to change. The layout, colors, and
            structure never change. Only the text you edit changes.
          </p>
        </div>

        <UploadZone />

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Feature icon={MousePointerClick} title="Click to edit" desc="Any text is editable inline" />
          <Feature icon={MessageSquareText} title="Chat to edit" desc="Natural-language text changes" />
          <Feature icon={Edit3} title="True to original" desc="Layout & styling preserved" />
        </div>
      </div>

      <div className="hidden lg:block">
        <DemoCard />
      </div>
    </div>
  );
}

function Feature({ icon: Icon, title, desc }: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 hover:shadow-md hover:border-violet-300 dark:hover:border-violet-800 transition-all">
      <div className="w-7 h-7 rounded-lg bg-violet-50 dark:bg-violet-950/40 flex items-center justify-center mb-2">
        <Icon className="w-4 h-4 text-violet-600 dark:text-violet-400" />
      </div>
      <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">{title}</p>
      <p className="text-[10px] text-zinc-500 leading-tight mt-0.5">{desc}</p>
    </div>
  );
}

function DemoCard() {
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 shadow-xl sticky top-24">
      <div className="text-center mb-4">
        <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2">How it works</p>
      </div>
      <div className="space-y-3">
        <Step n={1} title="Upload PDF" desc="Your schedule is shown as-is" />
        <Step n={2} title="Click any text" desc="It becomes editable inline" />
        <Step n={3} title="Type or chat" desc="Change names, times, dates" />
        <Step n={4} title="Export" desc="Download the edited PDF" />
      </div>
      <div className="mt-5 p-3 rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-900/50">
        <p className="text-[11px] text-violet-700 dark:text-violet-300 leading-relaxed">
          <Sparkles className="w-3 h-3 inline mr-1" />
          The original layout, colors, and structure are <strong>never modified</strong> — only the text content you choose to edit.
        </p>
      </div>
    </div>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-6 h-6 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
        {n}
      </div>
      <div>
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{title}</p>
        <p className="text-[11px] text-zinc-500">{desc}</p>
      </div>
    </div>
  );
}
