import { PDFDocument } from 'pdf-lib';
import { PdfDocument as PdfDocumentModel } from './Document';

/**
 * PdfEngine — the main entry point for the Pagecraft PDF editing engine.
 * Loads a PDF, exposes a high-level object model, and serializes changes back.
 */
export class PdfEngine {
  private document: PdfDocumentModel | null = null;

  async load(arrayBuffer: ArrayBuffer): Promise<PdfDocumentModel> {
    const pdfDoc = await PDFDocument.load(arrayBuffer, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    this.document = new PdfDocumentModel(pdfDoc);
    return this.document;
  }

  getDocument(): PdfDocumentModel | null {
    return this.document;
  }

  async save(): Promise<Uint8Array> {
    if (!this.document) throw new Error('No document loaded');
    return this.document.save();
  }

  saveArrayBuffer(): ArrayBuffer {
    if (!this.document) throw new Error('No document loaded');
    return this.document.saveArrayBuffer();
  }
}
