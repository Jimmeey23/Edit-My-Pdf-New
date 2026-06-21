// =====================================================
// Inline-editable schedule document model
// =====================================================

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
  font: string;    // original PDF font name
  size: number;    // font size in pt
  color: string;   // hex color
  page: number;
  rotation: number; // 0, -90, or 90 degrees
  // User-editable style overrides (undefined = use original)
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  letterSpacing?: number;
  hidden?: boolean; // if true, span is deleted/hidden from view
}

export interface SchedulePage {
  index: number;
  backgroundImage: string;
  width: number;
  height: number;
  pdfWidth: number;
  pdfHeight: number;
  scale: number;
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

export type InlineEditOp =
  | { type: 'replaceText'; find: string; replace: string; caseSensitive?: boolean }
  | { type: 'setSpanText'; spanId: string; text: string }
  | { type: 'setSpanColor'; spanId: string; color: string }
  | { type: 'setSpansColor'; find: string; color: string; caseSensitive?: boolean }
  | { type: 'setSpanTextByContent'; find: string; text: string; caseSensitive?: boolean; page?: number }
  | { type: 'hideSpan'; spanId: string }
  | { type: 'hideSpansByContent'; find: string; caseSensitive?: boolean; page?: number }
  | { type: 'setSpanStyle'; spanId: string; changes: Partial<Pick<TextSpan, 'size' | 'color' | 'bold' | 'italic' | 'align' | 'letterSpacing'>> };

export interface ChatResponse {
  reply: string;
  summary?: string;
  operations: InlineEditOp[];
}
