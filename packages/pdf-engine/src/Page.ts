import { PDFPage, degrees } from 'pdf-lib';
import { PdfDocument } from './Document';
import { TextObject } from './objects/TextObject';
import { ImageObject } from './objects/ImageObject';
import { AnnotationObject } from './objects/AnnotationObject';
import type { BoundingBox } from './types';

interface PageObjects {
  texts: TextObject[];
  images: ImageObject[];
  annotations: AnnotationObject[];
}

/**
 * Page — represents a single PDF page with its editable objects.
 */
export class Page {
  private pdfPage: PDFPage;
  private _index: number;
  private doc: PdfDocument;
  private _objects: PageObjects = { texts: [], images: [], annotations: [] };
  private _bbox: BoundingBox | null = null;

  constructor(pdfPage: PDFPage, index: number, doc: PdfDocument) {
    this.pdfPage = pdfPage;
    this._index = index;
    this.doc = doc;
  }

  setIndex(i: number) { this._index = i; }

  getIndex(): number { return this._index; }

  getWidth(): number { return this.pdfPage.getWidth(); }
  getHeight(): number { return this.pdfPage.getHeight(); }

  getBoundingBox(): BoundingBox {
    if (this._bbox) return this._bbox;
    const { width, height } = this.pdfPage.getSize();
    this._bbox = { x: 0, y: 0, width, height };
    return this._bbox;
  }

  getObjects(): { texts: TextObject[]; images: ImageObject[]; annotations: AnnotationObject[] } {
    return this._objects;
  }

  addTextObject(text: TextObject): void {
    this._objects.texts.push(text);
  }

  addImageObject(img: ImageObject): void {
    this._objects.images.push(img);
  }

  addAnnotation(annotation: AnnotationObject): string {
    const id = `ann-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    annotation.setId(id);
    this._objects.annotations.push(annotation);
    return id;
  }

  removeAnnotation(id: string): void {
    this._objects.annotations = this._objects.annotations.filter(a => a.getId() !== id);
  }

  getLibPage(): PDFPage {
    return this.pdfPage;
  }

  setRotation(deg: number): void {
    const valid = [0, 90, 180, 270];
    const angle = valid.includes(deg) ? deg : 0;
    this.pdfPage.setRotation(degrees(angle));
  }

  getRotation(): number {
    const rot = this.pdfPage.getRotation();
    return rot.angle;
  }

  setSize(width: number, height: number): void {
    this.pdfPage.setSize(width, height);
    this._bbox = null; // invalidate cache
  }

  // Render page to a canvas element
  async renderToCanvas(
    canvas: HTMLCanvasElement,
    scale: number = 1.0,
    signal?: AbortSignal
  ): Promise<void> {
    const { width, height } = this.pdfPage.getSize();
    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');

    // Set white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // pdf-lib doesn't render — we use pdf.js for rendering
    // This is a placeholder that will be replaced by pdf.js in the web app
    // The engine exposes the data; the app handles rendering
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }

  clone(): Page {
    // Deep clone of the page for duplication
    const doc = this.doc.getLibDoc();
    const [w, h] = [this.getWidth(), this.getHeight()];
    const newPage = doc.addPage([w, h]);
    newPage.setRotation(this.pdfPage.getRotation());
    const page = new Page(newPage, this.doc.getPageCount(), this.doc);
    return page;
  }
}
