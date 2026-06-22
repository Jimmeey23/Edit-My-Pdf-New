'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Send, Sparkles, Loader2, Bot, User, CornerDownLeft } from 'lucide-react';
import { useInlineStore } from '@/lib/inline-store';
import type { InlineEditOp } from '@/lib/inline-types';
import { cn } from '@/lib/utils';

const SUGGESTIONS = [
  'Swap Reshma with Anjali',
  'Change the date to July 7th - July 13th 2026',
  'Change BANDRA to BANDRA WEST',
  'Replace all Mrigakshi with Priya',
];

export function ChatPanel() {
  const {
    messages, isChatting, chatError,
    document: doc, pushMessage, applyOps, setChatting, setChatError,
  } = useInlineStore();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isChatting]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !doc || isChatting) return;
    setInput('');
    pushMessage({ role: 'user', content: trimmed });
    setChatting(true);
    setChatError(null);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          document: doc,
          history: messages.slice(-6).map(m => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Chat failed' }));
        throw new Error(err.error || 'Chat failed');
      }
      const data = await res.json();
      pushMessage({
        role: 'assistant',
        content: data.reply || 'Done.',
        summary: data.summary,
      });
      if (Array.isArray(data.operations) && data.operations.length > 0) {
        applyOps(data.operations as InlineEditOp[], data.summary || `${data.operations.length} edit(s)`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Chat failed';
      setChatError(msg);
      pushMessage({ role: 'assistant', content: `Sorry — ${msg}` });
    } finally {
      setChatting(false);
    }
  }, [doc, isChatting, messages, pushMessage, applyOps, setChatting, setChatError]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">Chat to edit text</p>
          <p className="text-[11px] text-zinc-500 truncate">Or click any text on the left to edit inline ←</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.map(m => (
          <MessageBubble key={m.id} role={m.role} content={m.content} summary={m.summary} />
        ))}
        {isChatting && (
          <div className="flex gap-2 items-start">
            <BotAvatar />
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl rounded-tl-sm bg-zinc-100 dark:bg-zinc-800">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" />
              <span className="text-xs text-zinc-500">Thinking…</span>
            </div>
          </div>
        )}
        {chatError && (
          <div className="text-xs text-red-600 dark:text-red-400 px-2">{chatError}</div>
        )}
      </div>

      {messages.length <= 1 && !isChatting && (
        <div className="px-3 pb-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => send(s)}
              className="text-[11px] px-2.5 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-violet-100 dark:hover:bg-violet-900/40 hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="border-t border-zinc-200 dark:border-zinc-800 p-2.5 flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={doc ? "Ask to change any text…" : "Upload a schedule first…"}
          disabled={!doc || isChatting}
          className="flex-1 px-3 py-2 text-sm rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-transparent focus:border-violet-400 focus:bg-white dark:focus:bg-zinc-950 outline-none transition-colors disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!doc || isChatting || !input.trim()}
          className="px-3 py-2 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white text-sm font-medium hover:shadow-lg hover:shadow-violet-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
        >
          <Send className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Send</span>
        </button>
      </form>

      <div className="px-3 pb-2 flex items-center gap-1.5 text-[10px] text-zinc-400">
        <CornerDownLeft className="w-3 h-3" />
        <span>Press Enter to send</span>
      </div>
    </div>
  );
}

function MessageBubble({ role, content, summary }: { role: 'user' | 'assistant'; content: string; summary?: string }) {
  const isUser = role === 'user';
  return (
    <div className={cn("flex gap-2 items-start", isUser && "flex-row-reverse")}>
      {isUser ? <UserAvatar /> : <BotAvatar />}
      <div
        className={cn(
          "max-w-[80%] px-3 py-2 rounded-2xl text-sm",
          isUser
            ? "bg-gradient-to-br from-violet-500 to-purple-600 text-white rounded-tr-sm"
            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 rounded-tl-sm"
        )}
      >
        <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
        {summary && !isUser && (
          <div className="mt-1.5 pt-1.5 border-t border-black/10 dark:border-white/10 text-[10px] opacity-70 italic">
            ✓ {summary}
          </div>
        )}
      </div>
    </div>
  );
}

function UserAvatar() {
  return (
    <div className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center shrink-0">
      <User className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-300" />
    </div>
  );
}

function BotAvatar() {
  return (
    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
      <Bot className="w-3.5 h-3.5 text-white" />
    </div>
  );
}
