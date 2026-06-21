'use client';

import { create } from 'zustand';
import type {
  ScheduleDocument,
  ScheduleClass,
  ClassLevel,
  ClassHighlight,
  EditOp,
  TickerBand,
  ScheduleTheme,
} from '@/lib/schedule-types';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  summary?: string;
  ts: number;
}

export interface HistoryEntry {
  id: string;
  before: ScheduleDocument | null;
  after: ScheduleDocument;
  summary: string;
  ts: number;
}

interface ScheduleStore {
  // Document state
  original: ScheduleDocument | null;   // immutable, post-parse
  current: ScheduleDocument | null;    // edited version
  previewUrl: string | null;           // original PDF/image preview as data URL

  // Chat
  messages: ChatMessage[];
  isChatting: boolean;
  chatError: string | null;

  // History
  history: HistoryEntry[];             // newest first
  redoStack: HistoryEntry[];

  // Edit visibility flag — true when there are unseen edits (used to pulse
  // the "Edited" toggle in the preview pane).
  hasUnviewedEdits: boolean;

  // File status
  isParsing: boolean;
  parseError: string | null;

  // Actions
  loadDocument: (doc: ScheduleDocument, previewUrl: string | null) => void;
  reset: () => void;
  applyOps: (ops: EditOp[], summary: string) => void;
  undo: () => void;
  redo: () => void;
  pushMessage: (m: Omit<ChatMessage, 'id' | 'ts'>) => void;
  setChatting: (b: boolean) => void;
  setChatError: (e: string | null) => void;
  setParsing: (b: boolean, err?: string | null) => void;
  directEdit: (mutator: (draft: ScheduleDocument) => void, summary: string) => void;
  markEditsViewed: () => void;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function uid(prefix = '') {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

const DAY_NAMES = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;

/** Apply a single edit operation to a cloned document (immutable). */
function applyOp(doc: ScheduleDocument, op: EditOp): ScheduleDocument {
  const next = clone(doc);
  switch (op.type) {
    case 'set': {
      const path = op.path;
      if (path === 'studioName') next.studioName = String(op.value);
      else if (path === 'location') next.location = String(op.value);
      else if (path === 'dateRange') next.dateRange = String(op.value);
      else if (path === 'tagline') next.tagline = String(op.value);
      break;
    }
    case 'patchTheme': {
      next.theme = { ...next.theme, ...(op.changes as Partial<ScheduleTheme>) };
      break;
    }
    case 'setBandColor': {
      const lvl = (op as any).level as ClassLevel;
      const color = String((op as any).color);
      if (['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].includes(lvl)) {
        next.theme.bandColors[lvl] = color;
      }
      break;
    }
    case 'replaceTicker': {
      const bands = (op as any).bands as TickerBand[];
      next.tickerBands = bands.map((b, i) => ({ id: `band-${i + 1}`, ...b }));
      break;
    }
    case 'addClass': {
      const dayName = String((op as any).dayName).toUpperCase();
      const day = next.days.find(d => d.name === dayName);
      if (day) {
        const opCls = (op as any).cls || (op as any);
        const newCls: ScheduleClass = {
          id: uid(`${dayName}-`),
          time: String(opCls.time || (op as any).time || ''),
          className: String(opCls.className || (op as any).className || ''),
          instructor: String(opCls.instructor || (op as any).instructor || ''),
          level: (['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].includes(opCls.level || (op as any).level) ? (opCls.level || (op as any).level) : 'BEGINNER') as ClassLevel,
          highlight: (['none', 'sold-out', 'trainer-choice', 'custom'].includes(opCls.highlight) ? opCls.highlight : 'none') as ClassHighlight | undefined,
          note: typeof opCls.note === 'string' ? opCls.note : undefined,
          bgColor: typeof opCls.bgColor === 'string' ? opCls.bgColor : undefined,
          textColor: typeof opCls.textColor === 'string' ? opCls.textColor : undefined,
        };
        day.classes.push(newCls);
        // Re-sort by time
        day.classes.sort((a, b) => timeToMin(a.time) - timeToMin(b.time));
      }
      break;
    }
    case 'removeClass': {
      const dayName = String((op as any).dayName).toUpperCase();
      const match = (op as any).match || {};
      const day = next.days.find(d => d.name === dayName);
      if (day) {
        day.classes = day.classes.filter(c => !classMatches(c, match));
      }
      break;
    }
    case 'updateClass': {
      const dayName = String((op as any).dayName).toUpperCase();
      const match = (op as any).match || {};
      const changes = (op as any).changes || {};
      const day = next.days.find(d => d.name === dayName);
      if (day) {
        day.classes = day.classes.map(c => {
          if (classMatches(c, match)) {
            return { ...c, ...changes, id: c.id };
          }
          return c;
        });
        day.classes.sort((a, b) => timeToMin(a.time) - timeToMin(b.time));
      }
      break;
    }
    case 'updateAll': {
      const match = (op as any).match || {};
      const changes = (op as any).changes || {};
      next.days.forEach(day => {
        day.classes = day.classes.map(c => classMatches(c, match) ? { ...c, ...changes, id: c.id } : c);
        day.classes.sort((a, b) => timeToMin(a.time) - timeToMin(b.time));
      });
      break;
    }
    case 'addDay': {
      const dayName = String((op as any).dayName).toUpperCase();
      if (!next.days.find(d => d.name === dayName)) {
        next.days.push({ id: uid('day-'), name: dayName, classes: [] });
        // Re-sort by week order
        next.days.sort((a, b) => DAY_NAMES.indexOf(a.name as any) - DAY_NAMES.indexOf(b.name as any));
      }
      break;
    }
    case 'removeDay': {
      const dayName = String((op as any).dayName).toUpperCase();
      next.days = next.days.filter(d => d.name !== dayName);
      break;
    }
    case 'replaceClassLevels': {
      const rows = (op as any).rows || [];
      next.classLevels = rows;
      break;
    }
    case 'swapInstructor': {
      const from = String((op as any).from);
      const to = String((op as any).to);
      next.days.forEach(day => {
        day.classes.forEach(c => {
          if (c.instructor.toLowerCase() === from.toLowerCase()) c.instructor = to;
        });
      });
      break;
    }
    case 'setFont': {
      const family = String((op as any).family);
      const value = String((op as any).value);
      if (family === 'heading') next.theme.fontFamilyHeading = value;
      else if (family === 'body') next.theme.fontFamilyBody = value;
      else if (family === 'display') next.theme.fontFamilyDisplay = value;
      else if (family === 'ticker') next.theme.fontFamilyTicker = value;
      break;
    }
    case 'setClassHighlight': {
      const dayName = String((op as any).dayName).toUpperCase();
      const match = (op as any).match || {};
      const highlight = String((op as any).highlight || 'none') as ClassHighlight;
      const note = (op as any).note !== undefined ? String((op as any).note) : undefined;
      const day = next.days.find(d => d.name === dayName);
      if (day) {
        day.classes = day.classes.map(c => {
          if (classMatches(c, match)) {
            return { ...c, highlight, ...(note !== undefined ? { note } : {}) };
          }
          return c;
        });
      }
      break;
    }
    case 'replaceAll': {
      return (op as any).doc as ScheduleDocument;
    }
    default: {
      // Unknown op type — ignore
    }
  }
  next.meta.updatedAt = new Date().toISOString();
  return next;
}

function classMatches(c: ScheduleClass, match: Record<string, unknown>): boolean {
  if ('time' in match && match.time && c.time.toLowerCase() !== String(match.time).toLowerCase()) return false;
  if ('className' in match && match.className && c.className.toLowerCase() !== String(match.className).toLowerCase()) return false;
  if ('instructor' in match && match.instructor && c.instructor.toLowerCase() !== String(match.instructor).toLowerCase()) return false;
  // At least one criterion must be specified and match
  return 'time' in match || 'className' in match || 'instructor' in match;
}

function timeToMin(t: string): number {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return 9999;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

export const useScheduleStore = create<ScheduleStore>((set, get) => ({
  original: null,
  current: null,
  previewUrl: null,
  messages: [],
  isChatting: false,
  chatError: null,
  history: [],
  redoStack: [],
  isParsing: false,
  parseError: null,
  hasUnviewedEdits: false,

  loadDocument: (doc, previewUrl) => {
    set({
      original: clone(doc),
      current: clone(doc),
      previewUrl,
      messages: [{
        id: uid('m-'),
        role: 'assistant',
        content: `Schedule loaded from ${doc.meta.sourceFileName}. Ask me to edit anything — try "swap Reshma with Anjali", "change the accent color to pink", or "add a 6 AM HIIT class on Friday".`,
        ts: Date.now(),
      }],
      history: [],
      redoStack: [],
      isParsing: false,
      parseError: null,
      chatError: null,
      isChatting: false,
      hasUnviewedEdits: false,
    });
  },

  reset: () => set({
    original: null,
    current: null,
    previewUrl: null,
    messages: [],
    history: [],
    redoStack: [],
    isParsing: false,
    parseError: null,
    chatError: null,
    isChatting: false,
    hasUnviewedEdits: false,
  }),

  applyOps: (ops, summary) => {
    const state = get();
    if (!state.current || ops.length === 0) return;
    const before = clone(state.current);
    let next = before;
    for (const op of ops) {
      next = applyOp(next, op);
    }
    set({
      current: next,
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
    if (!state.history.length || !state.current) return;
    const [last, ...rest] = state.history;
    if (!last.before) {
      // Initial load — reset to original
      set({
        current: state.original,
        history: rest,
        redoStack: [last, ...state.redoStack].slice(0, 50),
      });
      return;
    }
    set({
      current: last.before,
      history: rest,
      redoStack: [last, ...state.redoStack].slice(0, 50),
    });
  },

  redo: () => {
    const state = get();
    if (!state.redoStack.length || !state.current) return;
    const [next, ...rest] = state.redoStack;
    set({
      current: next.after,
      history: [{ ...next, before: state.current }, ...state.history].slice(0, 50),
      redoStack: rest,
    });
  },

  pushMessage: m => set(s => ({
    messages: [...s.messages, { ...m, id: uid('m-'), ts: Date.now() }],
  })),

  setChatting: b => set({ isChatting: b }),
  setChatError: e => set({ chatError: e }),
  setParsing: (b, err = null) => set({ isParsing: b, parseError: err }),

  markEditsViewed: () => set({ hasUnviewedEdits: false }),

  directEdit: (mutator, summary) => {
    const state = get();
    if (!state.current) return;
    const before = clone(state.current);
    const next = clone(state.current);
    mutator(next);
    next.meta.updatedAt = new Date().toISOString();
    set({
      current: next,
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
}));
