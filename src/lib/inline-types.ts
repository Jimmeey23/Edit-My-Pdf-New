// =====================================================
// Inline-editable schedule document model
// =====================================================
// The document is stored as a list of pages. Each page has:
//   - backgroundImage: a PNG data URL of the original PDF page with ALL TEXT
//     REDACTED (only colored blocks, borders, circles remain)
//   - spans: a list of text spans with their exact position, font, size, color
//     — each span is overlaid on the background as an editable text element
//
// Editing a span only changes its `text` field. The position, font, size, and
// color never change. The background image never changes. This guarantees the
// document ALWAYS looks identical to the original — only the text content
// changes.
//
// This is true inline editing on top of the actual uploaded PDF.

export interface TextSpan {
  id: string;
  text: string;
  originalText: string;
  x: number;       // PDF coords (pt)
  y: number;
  x2: number;
  y2: number;
  w: number;
  h: number;
  font: string;    // original PDF font name (for reference)
  size: number;    // font size in pt
  color: string;   // hex color
  page: number;
}

export interface SchedulePage {
  index: number;
  backgroundImage: string;   // PNG data URL
  width: number;             // px (rendered)
  height: number;            // px (rendered)
  pdfWidth: number;          // pt (original PDF)
  pdfHeight: number;         // pt
  scale: number;             // background render scale (e.g. 2.5)
  spans: TextSpan[];
}

export interface InlineScheduleDocument {
  id: string;
  pages: SchedulePage[];
  sourceType: 'pdf' | 'image' | 'docx';
  sourceFileName?: string;
  createdAt: string;
  updatedAt: string;
}

// =====================================================
// Edit operations for chat-driven inline editing
// =====================================================

export type InlineEditOp =
  | { type: 'replaceText'; find: string; replace: string; caseSensitive?: boolean }
  | { type: 'setSpanText'; spanId: string; text: string }
  | { type: 'setSpanColor'; spanId: string; color: string }
  | { type: 'setSpansColor'; find: string; color: string; caseSensitive?: boolean }
  | { type: 'setSpanTextByContent'; find: string; text: string; caseSensitive?: boolean; page?: number };

export interface ChatResponse {
  reply: string;
  summary?: string;
  operations: InlineEditOp[];
}
