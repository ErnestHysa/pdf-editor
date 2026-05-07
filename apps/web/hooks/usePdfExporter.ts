"use client";
import { PDFDocument, rgb, StandardFonts, degrees } from "pdf-lib";
import { useDocumentStore } from "@/stores/documentStore";

/**
 * Applies text object changes from Zustand textObjects to the pdf-lib document,
 * then returns the modified PDF bytes. This is the R20 "write back to PDF" pipeline.
 *
 * Strategy: For each text object in Zustand that has been modified or is new
 * (objectRef !== original PDF ref), add the text content as a pdf-lib text element
 * on the correct page. The original PDF text remains (pdf-lib doesn't support in-place
 * content stream editing), but modified text is re-rendered on top.
 *
 * Future (R21+): Parse raw PDF content streams for true in-place replacement.
 */
export async function exportPdfWithChanges(): Promise<Uint8Array> {
  const { pdfDocument, textObjects } = useDocumentStore.getState();

  if (!pdfDocument) throw new Error("No PDF document loaded");

  const libDoc = pdfDocument.getLibDoc();

  // Get all pages
  const pages = libDoc.getPages();

  // Group text objects by pageIndex
  const byPage: Map<number, typeof textObjects> = new Map();
  for (const obj of textObjects) {
    const existing = byPage.get(obj.pageIndex) ?? [];
    existing.push(obj);
    byPage.set(obj.pageIndex, existing);
  }

  // For each page with text changes, embed new text overlays
  for (const [pageIndex, objects] of Array.from(byPage.entries())) {
    if (pageIndex < 0 || pageIndex >= pages.length) continue;
    const page = pages[pageIndex];

    for (const textObj of objects) {
      // Skip if this is an unmodified original (has a real PDF object ref)
      if (textObj.objectRef && textObj.objectRef !== "new") continue;

      // Parse font
      let font;
      try {
        font = await libDoc.embedFont(StandardFonts.Helvetica);
      } catch {
        font = await libDoc.embedFont(StandardFonts.Helvetica);
      }

      // Parse color (hex → rgb)
      const color = parseHexColor(textObj.color);
      const size = textObj.fontSize ?? 14;
      const { x, y } = textObj;

      // pdf-lib text is positioned at baseline, PDF coordinates have origin at bottom-left
      // We need to account for page height to convert from top-left DOM coords
      const pageHeight = page.getHeight();

      // Convert top-left y to bottom-left y (pdf-lib uses bottom-left origin)
      const pdfY = pageHeight - y - (textObj.height ?? size);

      // Apply text
      const text = textObj.content ?? "";

      if (textObj.textAlign === "center") {
        page.drawText(text, {
          x,
          y: pdfY,
          size,
          font,
          color,
          rotate: textObj.rotation ? degrees(textObj.rotation) : degrees(0),
        });
      } else if (textObj.textAlign === "right") {
        // Approximate right-align by measuring text width (simplified)
        const approxWidth = text.length * size * 0.6;
        page.drawText(text, {
          x: x - approxWidth,
          y: pdfY,
          size,
          font,
          color,
          rotate: textObj.rotation ? degrees(textObj.rotation) : degrees(0),
        });
      } else {
        page.drawText(text, {
          x,
          y: pdfY,
          size,
          font,
          color,
          rotate: textObj.rotation ? degrees(textObj.rotation) : degrees(0),
        });
      }
    }
  }

  return libDoc.save();
}

/** Convert hex color string to pdf-lib RGB */
function parseHexColor(hex: string): ReturnType<typeof rgb> {
  try {
    const clean = hex.replace("#", "");
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    return rgb(r, g, b);
  } catch {
    return rgb(0, 0, 0);
  }
}

/** Trigger a download of the current PDF with changes applied */
export async function downloadPdfWithChanges(): Promise<void> {
  const { fileName } = useDocumentStore.getState();
  const bytes = await exportPdfWithChanges();
  const arr: number[] = Array.from(bytes);
  const blob = new Blob([new Uint8Array(arr)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.replace(/\.pdf$/i, "") + "-edited.pdf";
  a.click();
  URL.revokeObjectURL(url);
}
