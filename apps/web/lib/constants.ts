export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4.0;
export const ZOOM_STEP = 0.1;
export const DEFAULT_ZOOM = 1.0;

export const PAGE_SIZES: Record<string, { width: number; height: number }> = {
  A4: { width: 595.28, height: 841.89 },
  Letter: { width: 612, height: 792 },
  Legal: { width: 612, height: 1008 },
  A5: { width: 420.94, height: 595.28 },
};

export const CANVAS_PPI = 96;
export const PDF_DPI = 72;

export const AUTOSAVE_DELAY_MS = 5000;
export const WORKER_MESSAGE_TIMEOUT_MS = 30000;

export const TOOLS = [
  { id: 'select', label: 'Select', shortcut: 'V', icon: 'MousePointer2' },
  { id: 'text', label: 'Text', shortcut: 'T', icon: 'Type' },
  { id: 'rectangle', label: 'Rectangle', shortcut: 'R', icon: 'Square' },
  { id: 'ellipse', label: 'Ellipse', shortcut: 'E', icon: 'Circle' },
  { id: 'line', label: 'Line', shortcut: 'L', icon: 'Minus' },
  { id: 'arrow', label: 'Arrow', shortcut: 'A', icon: 'ArrowRight' },
  { id: 'highlight', label: 'Highlight', shortcut: 'H', icon: 'Highlighter' },
  { id: 'underline', label: 'Underline', shortcut: 'U', icon: 'Underline' },
  { id: 'strikethrough', label: 'Strikethrough', shortcut: 'S', icon: 'Strikethrough' },
  { id: 'sticky', label: 'Sticky Note', shortcut: 'N', icon: 'StickyNote' },
  { id: 'comment', label: 'Comment', shortcut: 'C', icon: 'MessageSquare' },
  { id: 'draw', label: 'Freehand Draw', shortcut: 'D', icon: 'Pencil' },
  { id: 'image', label: 'Image', shortcut: 'I', icon: 'Image' },
  { id: 'signature', label: 'Signature', shortcut: 'G', icon: 'Pen' },
] as const;

export type ToolId = typeof TOOLS[number]['id'];
