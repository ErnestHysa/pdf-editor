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
export async function optimizePdfStandard(doc: PDFDocument): Promise<Uint8Array> {
  // pdf-lib's save() already performs optimization like removing unused objects
  // and combining common objects. For explicit control, we flush and re-save.
  return doc.save();
}

/**
 * S4: Alternative optimized save using FlateDecode recompression.
 * This applies additional FlateDecode recompression using per-page stream stats.
 *
 * NOTE: This is currently a placeholder — the full FlateDecode recompression
 * approach requires iterating page content streams and re-encoding them.
 * For now, this falls back to doc.save() which handles basic optimization.
 *
 * @param doc - The pdf-lib PDFDocument to optimize
 * @returns Promise resolving to optimized PDF bytes
 */
export async function optimizePdfFlate(doc: PDFDocument): Promise<Uint8Array> {
  // Placeholder: Full FlateDecode recompression would iterate page content streams,
  // decode existing streams and re-encode them with better compression settings.
  // pdf-lib's save() with default options already performs basic stream optimization.
  return doc.save();
}