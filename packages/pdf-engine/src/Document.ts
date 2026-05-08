import { PDFDocument } from 'pdf-lib';
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
      this._pages.splice(afterIndex + 1, 0, page);
      this.reindexPages();
    } else {
      this._pages.push(page);
    }
    return page;
  }

  removePage(index: number): void {
    if (index < 0 || index >= this._pages.length) return;
    this.pdfLibDoc.removePage(index);
    this._pages.splice(index, 1);
    this.reindexPages();
  }

  /**
   * Reorder pages: move page at fromIndex to toIndex.
   * Uses the internal array as canonical order; reindexes on save.
   */
  reorderPages(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= this._pages.length) return;
    if (toIndex < 0 || toIndex >= this._pages.length) return;

    const [page] = this._pages.splice(fromIndex, 1);
    this._pages.splice(toIndex, 0, page);
    this.reindexPages();
  }

  /**
   * Duplicate a page at the given index, inserting the copy right after.
   * Note: true content cloning requires deep PDF stream copying.
   * This creates a new blank page with same dimensions/rotation.
   */
  duplicatePage(index: number): Page {
    if (index < 0 || index >= this._pages.length) {
      throw new Error(`Invalid page index: ${index}`);
    }
    const srcPage = this._pages[index];
    const [w, h] = [srcPage.getWidth(), srcPage.getHeight()];

    const newPage = this.pdfLibDoc.addPage([w, h]);
    newPage.setRotation(srcPage.getLibPage().getRotation());

    const newPageObj = new Page(newPage, index + 1, this);
    this._pages.splice(index + 1, 0, newPageObj);
    this.reindexPages();
    return newPageObj;
  }

  /**
   * Create a PdfDocument from an ArrayBuffer (e.g., from a file).
   */
  static async loadFromArrayBuffer(buffer: ArrayBuffer): Promise<PdfDocument> {
    const pdfLibDoc = await PDFDocument.load(buffer, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    return new PdfDocument(pdfLibDoc);
  }

  /**
   * Insert pages from a File at a given position.
   * Returns the number of pages inserted.
   */
  async insertPagesFromFile(file: File, afterIndex: number): Promise<number> {
    const buffer = await file.arrayBuffer();
    const sourceDoc = await PdfDocument.loadFromArrayBuffer(buffer);
    return this.insertPagesFromDocument(sourceDoc, afterIndex);
  }

  /**
   * Insert pages from another PdfDocument at a given position.
   * Returns the number of pages inserted.
   */
  async insertPagesFromDocument(
    sourceDoc: PdfDocument,
    afterIndex: number,
    pageIndices?: number[]
  ): Promise<number> {
    const srcPages = sourceDoc.getPages();
    const indices = pageIndices ?? srcPages.map((_, i) => i);
    const validIndices = indices.filter((i) => i >= 0 && i < srcPages.length);

    if (validIndices.length === 0) return 0;

    // Copy pages from source using pdf-lib's copyPages
    // We need to use the raw PDFDocument from the source
    const copiedPages = await this.pdfLibDoc.copyPages(
      sourceDoc.getLibDoc(),
      validIndices
    );

    // Insert each copied page after the specified index
    for (let i = 0; i < copiedPages.length; i++) {
      const newPage = copiedPages[i];
      const insertAt = Math.min(afterIndex + 1 + i, this._pages.length);
      // Add to pdf-lib doc at correct position
      // pdf-lib adds pages to the end; we track positions in our array
      this.pdfLibDoc.addPage(newPage);
      const pageObj = new Page(newPage, insertAt, this);
      this._pages.splice(insertAt, 0, pageObj);
    }

    this.reindexPages();
    return copiedPages.length;
  }

  private reindexPages(): void {
    this._pages.forEach((p, i) => p.setIndex(i));
  }

  async save(): Promise<Uint8Array> {
    return await this.pdfLibDoc.save();
  }

  async saveArrayBuffer(): Promise<ArrayBuffer> {
    if (!this.pdfLibDoc) {
      throw new Error('No pdf-lib document loaded');
    }
    const bytes = await this.pdfLibDoc.save();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  getLibDoc(): PDFDocument {
    return this.pdfLibDoc;
  }
}
