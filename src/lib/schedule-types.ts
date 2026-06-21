// =====================================================
// Schedule data model — single source of truth
// =====================================================
// All edits (chat-based or direct) operate on this shape.
// The renderer turns this into HTML that visually matches
// the original uploaded schedule.

export type ClassLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";

export type ClassHighlight = "none" | "sold-out" | "trainer-choice" | "custom";

export interface ScheduleClass {
  id: string;
  time: string;        // "7:30 AM"
  className: string;   // "MAT 57"
  instructor: string;  // "Reshma"
  level: ClassLevel;   // controls color band
  highlight?: ClassHighlight;  // sold-out = orange+white+strikethrough, trainer-choice = lime
  note?: string;              // small text like "(HARRY STYLES VS JT)"
  bgColor?: string;           // custom background color (overrides highlight)
  textColor?: string;         // custom text color (overrides default)
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
  background: string;     // page background (cream)
  topBandBg: string;      // lime green top band background
  primaryText: string;    // titles, day headers
  bodyText: string;       // class entries
  mutedText: string;      // ticker text
  accent: string;         // date range highlight color (lime)
  accentText: string;     // text on top of accent
  bandColors: Record<ClassLevel, string>; // color chip per level
  soldOutBg: string;      // orange sold-out background
  soldOutText: string;    // white sold-out text
  trainerChoiceBg: string; // lime trainer's-choice background
  cardBg: string;         // background of day card
  cardBorder: string;     // border of day card
  fontFamilyHeading: string;
  fontFamilyBody: string;
  fontFamilyDisplay: string;
  fontFamilyTicker: string;
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
  | { type: "addClass"; dayName: string; cls: ScheduleClass }
  | { type: "removeClass"; dayName: string; match: Record<string, unknown> }
  | { type: "updateClass"; dayName: string; match: Record<string, unknown>; changes: Partial<ScheduleClass> }
  | { type: "updateAll"; match: Record<string, unknown>; changes: Partial<ScheduleClass> }
  | { type: "addDay"; dayName: string }
  | { type: "removeDay"; dayName: string }
  | { type: "replaceTicker"; bands: TickerBand[] }
  | { type: "patchTheme"; changes: Partial<ScheduleTheme> }
  | { type: "setBandColor"; level: ClassLevel; color: string }
  | { type: "replaceClassLevels"; rows: ClassLevelRow[] }
  | { type: "swapInstructor"; from: string; to: string }
  | { type: "setFont"; family: "heading" | "body" | "display" | "ticker"; value: string }
  | { type: "setClassHighlight"; dayName: string; match: Record<string, unknown>; highlight: ClassHighlight; note?: string }
  | { type: "replaceAll"; doc: ScheduleDocument };

export interface ChatResponse {
  reply: string;        // user-facing message
  operations: EditOp[]; // ops to apply
  summary?: string;     // short change description for the activity log
}
