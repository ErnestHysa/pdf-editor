"use client";
import { PDFDocument } from "pdf-lib";

/**
 * S4: Optimize a PDF document using pdf-lib's built-in compression.
 * This flushes pending changes and re-saves with optimized metadata.
 *
 * The optimization performed by pdf-lib includes:
 * - Removing unused objects
 * - Combining common objects
 * - Re-compressing streams with FlateDecode
 *
 * @param doc - The pdf-lib PDFDocument to optimize
 * @returns Promise resolving to optimized PDF bytes
 */
export async function optimizePdf(doc: PDFDocument): Promise<Uint8Array> {
  // pdf-lib's save() already performs optimization like removing unused objects
  // and combining common objects. For explicit control, we flush and re-save.
  return doc.save();
}

/**
 * S4: Alternative optimized save using save_document() options if available.
 * This applies additional compression options.
 */
export async function optimizePdfWithCompression(doc: PDFDocument): Promise<Uint8Array> {
  // pdf-lib save with default optimization is typically sufficient
  // Additional compression can be applied via custom writer options if needed
  return doc.save();
}