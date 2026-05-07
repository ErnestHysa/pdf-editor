import type { BoundingBox, TextStyle } from '../types';

/**
 * TextObject — represents an editable text element in a PDF.
 * Backed by the actual PDF content stream.
 */
export class TextObject {
  private _id: string;
  private _content: string;
  private _style: TextStyle;
  private _bbox: BoundingBox;
  private _pageIndex: number;
  private _rotation: number;
  // Reference to the PDF object that holds this text (for mutation)
  private _objectRef: string; // e.g., "45 0 R"

  constructor(params: {
    id?: string;
    content: string;
    style: TextStyle;
    bbox: BoundingBox;
    pageIndex: number;
    objectRef?: string;
    rotation?: number;
  }) {
    this._id = params.id ?? Math.random().toString(36).slice(2);
    this._content = params.content;
    this._style = params.style;
    this._bbox = params.bbox;
    this._pageIndex = params.pageIndex;
    this._objectRef = params.objectRef ?? '';
    this._rotation = params.rotation ?? 0;
  }

  getId(): string { return this._id; }
  setId(id: string): void { this._id = id; }
  getContent(): string { return this._content; }
  getStyle(): TextStyle { return { ...this._style }; }
  getBBox(): BoundingBox { return { ...this._bbox }; }
  getPageIndex(): number { return this._pageIndex; }
  getObjectRef(): string { return this._objectRef; }
  getRotation(): number { return this._rotation; }

  setContent(newText: string): void {
    this._content = newText;
    // The caller (editor) is responsible for calling updateStream()
    // to write this change back to the PDF object
  }

  setStyle(style: Partial<TextStyle>): void {
    this._style = { ...this._style, ...style };
  }

  setBBox(bbox: Partial<BoundingBox>): void {
    this._bbox = { ...this._bbox, ...bbox };
  }

  setObjectRef(ref: string): void {
    this._objectRef = ref;
  }

  /**
   * Apply style changes to the underlying PDF content stream.
   * Called by the editor after setStyle() to persist changes.
   */
  applyToStream(streamBytes: Uint8Array): Uint8Array {
    // In a full implementation, this would parse the content stream
    // and update the text operators (Tj, TJ, Tm) with new values.
    // For now, return unchanged — real implementation in R11-R20.
    return streamBytes;
  }

  toAnnotationData(): Record<string, unknown> {
    return {
      id: this._id,
      type: 'text',
      content: this._content,
      style: this._style,
      bbox: this._bbox,
      pageIndex: this._pageIndex,
      rotation: this._rotation,
    };
  }
}
