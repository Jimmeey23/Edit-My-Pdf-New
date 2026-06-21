'use client';

import { create } from 'zustand';
import type { InlineScheduleDocument, TextSpan, InlineEditOp } from '@/lib/inline-types';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  summary?: string;
  ts: number;
}

export interface HistoryEntry {
  id: string;
  before: InlineScheduleDocument;
  after: InlineScheduleDocument;
  summary: string;
  ts: number;
}

interface InlineStore {
  document: InlineScheduleDocument | null;
  previewUrl: string | null;  // original PDF first page as PNG (for the "Original" toggle)

  // Chat
  messages: ChatMessage[];
  isChatting: boolean;
  chatError: string | null;

  // Editing
  editingSpanId: string | null;
  history: HistoryEntry[];
  redoStack: HistoryEntry[];

  // File status
  isParsing: boolean;
  parseError: string | null;
  hasUnviewedEdits: boolean;

  // Actions
  loadDocument: (doc: InlineScheduleDocument, previewUrl: string | null) => void;
  reset: () => void;
  applyOps: (ops: InlineEditOp[], summary: string) => void;
  undo: () => void;
  redo: () => void;
  setSpanText: (spanId: string, text: string, pageIdx: number) => void;
  setSpanTextDirect: (spanId: string, text: string) => void;
  startEditing: (spanId: string) => void;
  stopEditing: () => void;
  pushMessage: (m: Omit<ChatMessage, 'id' | 'ts'>) => void;
  setChatting: (b: boolean) => void;
  setChatError: (e: string | null) => void;
  setParsing: (b: boolean, err?: string | null) => void;
  markEditsViewed: () => void;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function uid(prefix = '') {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

/** Apply a single inline edit operation to a cloned document (immutable). */
function applyOp(doc: InlineScheduleDocument, op: InlineEditOp): InlineScheduleDocument {
  const next = clone(doc);
  for (const page of next.pages) {
    for (const span of page.spans) {
      applyOpToSpan(span, op);
    }
  }
  next.updatedAt = new Date().toISOString();
  return next;
}

function applyOpToSpan(span: TextSpan, op: InlineEditOp) {
  switch (op.type) {
    case 'replaceText': {
      const cs = op.caseSensitive ?? false;
      const find = cs ? op.find : op.find.toLowerCase();
      const text = cs ? span.text : span.text.toLowerCase();
      if (text.includes(find)) {
        if (cs) {
          span.text = span.text.split(op.find).join(op.replace);
        } else {
          // Case-insensitive replace
          const regex = new RegExp(escapeRegex(op.find), 'gi');
          span.text = span.text.replace(regex, op.replace);
        }
      }
      break;
    }
    case 'setSpanText': {
      if (span.id === op.spanId) {
        span.text = op.text;
      }
      break;
    }
    case 'setSpanColor': {
      if (span.id === op.spanId) {
        span.color = op.color;
      }
      break;
    }
    case 'setSpansColor': {
      const cs = op.caseSensitive ?? false;
      const find = cs ? op.find : op.find.toLowerCase();
      const text = cs ? span.text : span.text.toLowerCase();
      if (text.includes(find)) {
        span.color = op.color;
      }
      break;
    }
    case 'setSpanTextByContent': {
      const cs = op.caseSensitive ?? false;
      const find = cs ? op.find : op.find.toLowerCase();
      const text = cs ? span.text : span.text.toLowerCase();
      if (op.page !== undefined && span.page !== op.page) break;
      if (text.includes(find)) {
        span.text = op.text;
      }
      break;
    }
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const useInlineStore = create<InlineStore>((set, get) => ({
  document: null,
  previewUrl: null,
  messages: [],
  isChatting: false,
  chatError: null,
  editingSpanId: null,
  history: [],
  redoStack: [],
  isParsing: false,
  parseError: null,
  hasUnviewedEdits: false,

  loadDocument: (doc, previewUrl) => {
    set({
      document: doc,
      previewUrl,
      messages: [{
        id: uid('m-'),
        role: 'assistant',
        content: `Schedule loaded from ${doc.sourceFileName || 'your upload'}. Click any text to edit it directly, or tell me what to change in chat — like "swap Reshma with Anjali" or "change the date to July 7-13".`,
        ts: Date.now(),
      }],
      history: [],
      redoStack: [],
      isParsing: false,
      parseError: null,
      chatError: null,
      isChatting: false,
      editingSpanId: null,
      hasUnviewedEdits: false,
    });
  },

  reset: () => set({
    document: null,
    previewUrl: null,
    messages: [],
    history: [],
    redoStack: [],
    isParsing: false,
    parseError: null,
    chatError: null,
    isChatting: false,
    editingSpanId: null,
    hasUnviewedEdits: false,
  }),

  applyOps: (ops, summary) => {
    const state = get();
    if (!state.document || ops.length === 0) return;
    const before = clone(state.document);
    let next = before;
    for (const op of ops) {
      next = applyOp(next, op);
    }
    set({
      document: next,
      history: [{
        id: uid('h-'),
        before,
        after: next,
        summary,
        ts: Date.now(),
      }, ...state.history].slice(0, 50),
      redoStack: [],
      hasUnviewedEdits: true,
    });
  },

  undo: () => {
    const state = get();
    if (!state.history.length || !state.document) return;
    const [last, ...rest] = state.history;
    set({
      document: last.before,
      history: rest,
      redoStack: [last, ...state.redoStack].slice(0, 50),
    });
  },

  redo: () => {
    const state = get();
    if (!state.redoStack.length || !state.document) return;
    const [next, ...rest] = state.redoStack;
    set({
      document: next.after,
      history: [{ ...next, before: state.document }, ...state.history].slice(0, 50),
      redoStack: rest,
    });
  },

  setSpanText: (spanId, text, pageIdx) => {
    const state = get();
    if (!state.document) return;
    const before = clone(state.document);
    const next = clone(state.document);
    const page = next.pages[pageIdx];
    if (!page) return;
    const span = page.spans.find(s => s.id === spanId);
    if (!span || span.text === text) return;
    span.text = text;
    next.updatedAt = new Date().toISOString();
    set({
      document: next,
      history: [{
        id: uid('h-'),
        before,
        after: next,
        summary: `Edited: "${span.originalText.slice(0, 30)}" → "${text.slice(0, 30)}"`,
        ts: Date.now(),
      }, ...state.history].slice(0, 50),
      redoStack: [],
    });
  },

  setSpanTextDirect: (spanId, text) => {
    // Update without history (used while typing in the contentEditable)
    const state = get();
    if (!state.document) return;
    const next = clone(state.document);
    for (const page of next.pages) {
      const span = page.spans.find(s => s.id === spanId);
      if (span) {
        span.text = text;
        break;
      }
    }
    next.updatedAt = new Date().toISOString();
    set({ document: next });
  },

  startEditing: (spanId) => set({ editingSpanId: spanId }),
  stopEditing: () => set({ editingSpanId: null }),

  pushMessage: m => set(s => ({
    messages: [...s.messages, { ...m, id: uid('m-'), ts: Date.now() }],
  })),

  setChatting: b => set({ isChatting: b }),
  setChatError: e => set({ chatError: e }),
  setParsing: (b, err = null) => set({ isParsing: b, parseError: err }),
  markEditsViewed: () => set({ hasUnviewedEdits: false }),
}));
