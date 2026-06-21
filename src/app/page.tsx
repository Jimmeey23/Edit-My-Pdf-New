'use client';

import React, { useEffect } from 'react';
import { CalendarClock, Sparkles, Github, Wand2, Layers, Palette, MessageSquareText } from 'lucide-react';
import { useScheduleStore } from '@/lib/schedule/store';
import { UploadZone } from '@/components/schedule/upload-zone';
import { PreviewPane } from '@/components/schedule/preview-pane';
import { ChatPanel } from '@/components/schedule/chat-panel';

export default function Home() {
  const { current, reset } = useScheduleStore();

  // Esc to clear input focus
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
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-zinc-50 via-emerald-50/30 to-teal-50/40 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900">
      {/* Top bar */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <CalendarClock className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-50 leading-tight">
              Schedule Studio
            </h1>
            <p className="text-[11px] text-zinc-500 leading-tight">
              Upload · Preview · Chat to edit
            </p>
          </div>

          {current && (
            <button
              onClick={() => { if (confirm('Discard current schedule and upload a new one?')) reset(); }}
              className="text-xs px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 transition-colors"
            >
              New upload
            </button>
          )}

          <a
            href="https://z.ai"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>powered by Z.ai</span>
          </a>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 lg:px-6 py-4 lg:py-6">
        {!current ? (
          <LandingScreen />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_440px] gap-4 lg:gap-5 h-[calc(100vh-120px)] min-h-[600px]">
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
      {/* Hero + upload */}
      <div className="space-y-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-[11px] font-medium mb-3">
            <Wand2 className="w-3 h-3" />
            Chat-driven schedule editor
          </div>
          <h2 className="text-3xl lg:text-4xl font-bold text-zinc-900 dark:text-zinc-50 leading-tight">
            Upload your weekly schedule.<br />
            <span className="bg-gradient-to-r from-emerald-500 to-teal-600 bg-clip-text text-transparent">
              Edit it by chatting.
            </span>
          </h2>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400 max-w-xl">
            Drop a PDF, image, or DOCX of your studio schedule. We'll render it back exactly
            as-is in a live preview window — then let you change times, instructors, colors,
            theme bands, and alignment through natural-language chat. The original styling
            stays untouched until you ask for it.
          </p>
        </div>

        <UploadZone />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Feature icon={Layers} title="Pixel-faithful" desc="Original layout preserved" />
          <Feature icon={MessageSquareText} title="Chat to edit" desc="Natural-language ops" />
          <Feature icon={Palette} title="Theme bands" desc="Colors, fonts, accents" />
          <Feature icon={Sparkles} title="Live preview" desc="Undo / redo / export" />
        </div>
      </div>

      {/* Example preview */}
      <div className="hidden lg:block">
        <DemoCard />
      </div>
    </div>
  );
}

function Feature({ icon: Icon, title, desc }: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 hover:shadow-md hover:border-emerald-300 dark:hover:border-emerald-800 transition-all">
      <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center mb-2">
        <Icon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
      </div>
      <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">{title}</p>
      <p className="text-[10px] text-zinc-500 leading-tight mt-0.5">{desc}</p>
    </div>
  );
}

function DemoCard() {
  // Static stylised demo of what the renderer produces
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-xl shadow-zinc-200/40 dark:shadow-black/40 sticky top-24">
      <div className="text-[8px] text-zinc-400 whitespace-nowrap overflow-hidden mb-2">
        FOUNDATION : BARRE 57 • FOUNDATION : BARRE 57 • FOUNDATION : BARRE 57 • FOUNDATION : BARRE 57 •
      </div>
      <div className="text-[8px] text-zinc-400 whitespace-nowrap overflow-hidden mb-4">
        INTERMEDIATE: CARDIO BARRE, MAT 57 • INTERMEDIATE: CARDIO BARRE, MAT 57 •
      </div>
      <div className="text-center mb-5">
        <p className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight">STUDIO SCHEDULE</p>
        <p className="text-base font-bold text-zinc-700 dark:text-zinc-300 tracking-wide mt-0.5">BANDRA</p>
        <p className="text-xl italic font-bold text-emerald-500 mt-1.5" style={{ fontFamily: 'Georgia, serif' }}>
          June 1st - June 7th
        </p>
      </div>
      <div className="text-center text-[9px] text-zinc-700 dark:text-zinc-300 space-y-0.5 mb-4">
        <div><b>BEGINNER</b> : BARRE 57, powerCycle</div>
        <div><b>INTERMEDIATE</b> : CARDIO BARRE, MAT 57, FIT</div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {['MON', 'TUE', 'WED'].map(d => (
          <div key={d} className="rounded-md border border-zinc-200 dark:border-zinc-800 p-2 text-left">
            <div className="text-[9px] font-extrabold text-zinc-900 dark:text-zinc-50 border-b border-zinc-900 dark:border-zinc-200 pb-1 mb-1.5">{d}</div>
            {[
              { t: '7:30', c: 'MAT 57', i: 'Reshma', color: '#cdd750' },
              { t: '8:30', c: 'powerCycle', i: 'Anmol', color: '#efefdf' },
              { t: '9:00', c: 'BARRE 57', i: 'Vivaran', color: '#cdd750' },
            ].map((r, i) => (
              <div key={i} className="flex gap-1 mb-1">
                <div className="w-[2px] self-stretch rounded-sm" style={{ background: r.color }} />
                <div>
                  <div className="text-[7px] font-bold text-zinc-900 dark:text-zinc-100">{r.t} AM</div>
                  <div className="text-[7px] text-zinc-700 dark:text-zinc-300">{r.c} — {r.i}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-4 text-center text-[10px] text-zinc-400">
        <Sparkles className="w-3 h-3 inline mr-1" />
        Live preview after upload
      </div>
    </div>
  );
}
