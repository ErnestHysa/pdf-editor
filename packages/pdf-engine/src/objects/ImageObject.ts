import type { BoundingBox } from '../types';

/**
 * ImageObject — represents an image embedded in a PDF.
 */
export class ImageObject {
  private _id: string;
  private _src: string; // base64 data URL
  private _bbox: BoundingBox;
  private _pageIndex: number;
  private _opacity: number = 1;
  private _rotation: number = 0;
  private _imageRef: string; // PDF image XObject reference

  constructor(params: {
    id?: string;
    src: string;
    bbox: BoundingBox;
    pageIndex: number;
    imageRef?: string;
  }) {
    this._id = params.id ?? Math.random().toString(36).slice(2);
    this._src = params.src;
    this._bbox = params.bbox;
    this._pageIndex = params.pageIndex;
    this._imageRef = params.imageRef ?? '';
  }

  getId(): string { return this._id; }
  setId(id: string): void { this._id = id; }
  getSrc(): string { return this._src; }
  getBBox(): BoundingBox { return { ...this._bbox }; }
  getPageIndex(): number { return this._pageIndex; }
  getOpacity(): number { return this._opacity; }
  getRotation(): number { return this._rotation; }
  getImageRef(): string { return this._imageRef; }

  setSrc(base64: string): void { this._src = base64; }
  setBBox(bbox: Partial<BoundingBox>): void { this._bbox = { ...this._bbox, ...bbox }; }
  setOpacity(opacity: number): void { this._opacity = Math.max(0, Math.min(1, opacity)); }
  setRotation(deg: number): void { this._rotation = deg % 360; }

  async loadFromFile(file: File): Promise<void> {
    const buffer = await file.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );
    const mime = file.type || 'image/png';
    this._src = `data:${mime};base64,${base64}`;
  }

  toAnnotationData(): Record<string, unknown> {
    return {
      id: this._id,
      type: 'image',
      src: this._src,
      bbox: this._bbox,
      pageIndex: this._pageIndex,
      opacity: this._opacity,
      rotation: this._rotation,
    };
  }
}
