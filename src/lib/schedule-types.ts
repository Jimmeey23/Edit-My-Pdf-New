// =====================================================
// Schedule data model — single source of truth
// =====================================================
// All edits (chat-based or direct) operate on this shape.
// The renderer turns this into HTML that visually matches
// the original uploaded schedule.

export type ClassLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";

export interface ScheduleClass {
  id: string;
  time: string;        // "7:30 AM"
  className: string;   // "MAT 57"
  instructor: string;  // "Reshma"
  level: ClassLevel;   // controls color band
}

export interface ScheduleDay {
  id: string;
  name: string; // "MONDAY"
  classes: ScheduleClass[];
}

export interface TickerBand {
  id: string;
  text: string;        // text that scrolls in the marquee
  textColor: string;   // hex color
  bgColor: string;     // hex color or "transparent"
  fontSize: number;    // px
  italic?: boolean;
}

export interface ClassLevelRow {
  level: ClassLevel;
  classes: string[]; // list of class names offered
}

export interface ScheduleTheme {
  background: string;     // page background
  primaryText: string;    // titles, day headers
  bodyText: string;       // class entries
  mutedText: string;      // ticker text
  accent: string;         // date range highlight color
  accentText: string;     // text on top of accent
  bandColors: Record<ClassLevel, string>; // color chip per level
  cardBg: string;         // background of day card
  cardBorder: string;     // border of day card
  fontFamilyHeading: string;
  fontFamilyBody: string;
  fontFamilyDisplay: string;
}

export interface ScheduleDocument {
  id: string;
  studioName: string;        // "STUDIO SCHEDULE"
  location: string;          // "BANDRA"
  dateRange: string;         // "June 1st - June 7th 2026"
  tagline?: string;          // small text under date (e.g. "A LINKIN PARK SPECIAL")
  tickerBands: TickerBand[];
  classLevels: ClassLevelRow[];
  days: ScheduleDay[];
  theme: ScheduleTheme;
  meta: {
    sourceFileName?: string;
    sourceType?: "pdf" | "image" | "docx";
    createdAt: string;
    updatedAt: string;
  };
}

// =====================================================
// Edit operations produced by the chat LLM
// =====================================================

export type EditOp =
  | { type: "set"; path: string; value: unknown }
  | { type: "patch"; path: string; value: Record<string, unknown> }
  | { type: "addClass"; dayId: string; cls: ScheduleClass }
  | { type: "removeClass"; dayId: string; classId: string }
  | { type: "updateClass"; dayId: string; classId: string; changes: Partial<ScheduleClass> }
  | { type: "addDay"; day: ScheduleDay }
  | { type: "removeDay"; dayId: string }
  | { type: "replaceTicker"; bands: TickerBand[] }
  | { type: "patchTheme"; changes: Partial<ScheduleTheme> }
  | { type: "replaceClassLevels"; rows: ClassLevelRow[] }
  | { type: "replaceAll"; doc: ScheduleDocument };

export interface ChatResponse {
  reply: string;        // user-facing message
  operations: EditOp[]; // ops to apply
  summary?: string;     // short change description for the activity log
}
