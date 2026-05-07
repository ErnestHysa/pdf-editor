import { PDFDocument, PDFPage } from 'pdf-lib';
import { Page } from './Page';

/**
 * PdfDocument — the high-level model wrapping a pdf-lib PDFDocument.
 * Provides access to pages and orchestrates saves.
 */
export class PdfDocument {
  private pdfLibDoc: PDFDocument;
  private _pages: Page[] = [];

  constructor(pdfLibDoc: PDFDocument) {
    this.pdfLibDoc = pdfLibDoc;
    this._pages = pdfLibDoc.getPages().map((p, i) => new Page(p, i, this));
  }

  getPages(): Page[] {
    return this._pages;
  }

  getPage(index: number): Page | null {
    return this._pages[index] ?? null;
  }

  getPageCount(): number {
    return this._pages.length;
  }

  addPage(afterIndex: number = -1, size?: { width: number; height: number }): Page {
    const [w, h] = size ? [size.width, size.height] : [595.28, 841.89];
    const newPage = this.pdfLibDoc.addPage([w, h]);
    const page = new Page(newPage, this._pages.length, this);
    if (afterIndex >= 0 && afterIndex < this._pages.length) {
      // Move to correct position (insert after)
      // pdf-lib doesn't have a movePage, so we rebuild page order conceptually
      // For now, pages are in add order — reorder handled at Document level
    }
    this._pages.push(page);
    return page;
  }

  removePage(index: number): void {
    if (index < 0 || index >= this._pages.length) return;
    this.pdfLibDoc.removePage(index);
    this._pages.splice(index, 1);
    // Re-index remaining pages
    this._pages.forEach((p, i) => p.setIndex(i));
  }

  reorderPages(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return;
    const [page] = this._pages.splice(fromIndex, 1);
    this._pages.splice(toIndex, 0, page);
    // pdf-lib reorder
    this.pdfLibDoc.movePage(fromIndex, toIndex);
    this._pages.forEach((p, i) => p.setIndex(i));
  }

  save(): Uint8Array {
    return this.pdfLibDoc.save();
  }

  saveArrayBuffer(): ArrayBuffer {
    const bytes = this.save();
    const buf = new ArrayBuffer(bytes.length);
    new Uint8Array(buf).set(bytes);
    return buf;
  }

  getLibDoc(): PDFDocument {
    return this.pdfLibDoc;
  }
}
