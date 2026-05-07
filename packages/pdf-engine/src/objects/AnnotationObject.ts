import type { BoundingBox } from '../types';

export type AnnotationType =
  | 'highlight'
  | 'underline'
  | 'strikethrough'
  | 'sticky'
  | 'comment'
  | 'drawing'
  | 'shape'
  | 'textbox'
  | 'stamp';

interface ShapeStyle {
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
}

/**
 * AnnotationObject — PDF annotation backed annotation.
 * These are stored as real PDF annotation dictionaries, not canvas drawings.
 */
export class AnnotationObject {
  private _id: string;
  private _type: AnnotationType;
  private _contents: string;
  private _rect: BoundingBox;
  private _pageIndex: number;
  private _color: string;
  private _opacity: number;
  private _author?: string;
  private _shapeStyle?: ShapeStyle;
  private _points?: { x: number; y: number }[]; // for freehand drawing
  private _annotationRef?: string; // PDF annotation object ref

  constructor(params: {
    id?: string;
    type: AnnotationType;
    contents?: string;
    rect: BoundingBox;
    pageIndex: number;
    color?: string;
    opacity?: number;
  }) {
    this._id = params.id ?? Math.random().toString(36).slice(2);
    this._type = params.type;
    this._contents = params.contents ?? '';
    this._rect = params.rect;
    this._pageIndex = params.pageIndex;
    this._color = params.color ?? '#C97B3E';
    this._opacity = params.opacity ?? 1;
  }

  getId(): string { return this._id; }
  setId(id: string): void { this._id = id; }
  getType(): AnnotationType { return this._type; }
  getContents(): string { return this._contents; }
  getRect(): BoundingBox { return { ...this._rect }; }
  getPageIndex(): number { return this._pageIndex; }
  getColor(): string { return this._color; }
  getOpacity(): number { return this._opacity; }
  getAnnotationRef(): string { return this._annotationRef ?? ''; }

  setContents(text: string): void { this._contents = text; }
  setColor(color: string): void { this._color = color; }
  setOpacity(opacity: number): void { this._opacity = Math.max(0, Math.min(1, opacity)); }
  setRect(rect: BoundingBox): void { this._rect = rect; }
  setAuthor(author: string): void { this._author = author; }
  setShapeStyle(style: ShapeStyle): void { this._shapeStyle = style; }
  setPoints(points: { x: number; y: number }[]): void { this._points = points; }
  setAnnotationRef(ref: string): void { this._annotationRef = ref; }

  /**
   * Serialize to a PDF annotation dictionary format (used for export).
   * Returns an object compatible with pdf-lib's annotation API.
   */
  toPdfAnnotation(): Record<string, unknown> {
    const base = {
      type: this._type,
      rect: [this._rect.x, this._rect.y, this._rect.x + this._rect.width, this._rect.y + this._rect.height],
      color: this._hexToRgb(this._color),
      opacity: this._opacity,
      contents: this._contents,
    };

    switch (this._type) {
      case 'highlight':
        return { ...base, subtype: 'Highlight' };
      case 'underline':
        return { ...base, subtype: 'Underline' };
      case 'strikethrough':
        return { ...base, subtype: 'StrikeOut' };
      case 'sticky':
        return { ...base, subtype: 'Text', name: 'Note' };
      case 'comment':
        return { ...base, subtype: 'Text', name: 'Comment' };
      case 'drawing':
        return { ...base, subtype: 'Ink', inkPoints: this._points ?? [] };
      case 'shape':
        return { ...base, subtype: 'Square', ...this._shapeStyle };
      case 'textbox':
        return { ...base, subtype: 'FreeText', value: this._contents };
      case 'stamp':
        return { ...base, subtype: 'Stamp', name: this._contents };
      default:
        return base;
    }
  }

  private _hexToRgb(hex: string): [number, number, number] {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
  }
}
