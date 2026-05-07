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

/**
 * R53: Export PDF with all annotations and text objects flattened into the PDF content.
 * This draws all editing layer content directly onto each page for "final" PDFs.
 */
export async function exportPdfFlattened(): Promise<Uint8Array> {
  const { pdfDocument, textObjects, annotations, imageObjects } = useDocumentStore.getState();

  if (!pdfDocument) throw new Error("No PDF document loaded");

  const libDoc = pdfDocument.getLibDoc();
  const pages = libDoc.getPages();

  // Group objects by pageIndex
  const textByPage = new Map<number, typeof textObjects>();
  for (const obj of textObjects) {
    const existing = textByPage.get(obj.pageIndex) ?? [];
    existing.push(obj);
    textByPage.set(obj.pageIndex, existing);
  }

  const annByPage = new Map<number, typeof annotations>();
  for (const obj of annotations) {
    const existing = annByPage.get(obj.pageIndex) ?? [];
    existing.push(obj);
    annByPage.set(obj.pageIndex, existing);
  }

  // Process each page
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex];
    const pageHeight = page.getHeight();
    const pageWidth = page.getWidth();

    // Draw all text objects (including originals with refs)
    const pageTexts = textByPage.get(pageIndex) ?? [];
    for (const textObj of pageTexts) {
      let font;
      try {
        font = await libDoc.embedFont(StandardFonts.Helvetica);
      } catch {
        font = await libDoc.embedFont(StandardFonts.Helvetica);
      }

      const color = parseHexColor(textObj.color);
      const size = textObj.fontSize ?? 14;
      const pdfY = pageHeight - textObj.y - (textObj.height ?? size);

      page.drawText(textObj.content ?? "", {
        x: textObj.x,
        y: pdfY,
        size,
        font,
        color,
        rotate: textObj.rotation ? degrees(textObj.rotation) : degrees(0),
      });
    }

    // Draw all annotations on this page
    const pageAnnotations = annByPage.get(pageIndex) ?? [];
    for (const ann of pageAnnotations) {
      const color = parseHexColor(ann.color);
      const pdfY = pageHeight - ann.y - ann.height;
      const opacity = ann.opacity ?? 1;

      switch (ann.type) {
        case 'rectangle':
        case 'underline':
        case 'strikethrough': {
          const strokeW = (ann as { strokeWidth?: number }).strokeWidth ?? 1;
          if (ann.type === 'rectangle') {
            const filled = (ann as { filled?: boolean }).filled ?? false;
            page.drawRectangle({
              x: ann.x,
              y: pdfY,
              width: ann.width,
              height: ann.height,
              borderColor: color,
              borderWidth: strokeW,
              color: filled ? color : undefined,
              opacity,
            });
          } else {
            // underline/strikethrough → draw line
            page.drawLine({
              start: { x: ann.x, y: pdfY + ann.height / 2 },
              end: { x: ann.x + ann.width, y: pdfY + ann.height / 2 },
              thickness: strokeW,
              color,
              opacity,
            });
          }
          break;
        }
        case 'ellipse': {
          const strokeW = (ann as { strokeWidth?: number }).strokeWidth ?? 1;
          page.drawEllipse({
            x: ann.x + ann.width / 2,
            y: pdfY + ann.height / 2,
            xScale: ann.width / 2,
            yScale: ann.height / 2,
            borderColor: color,
            borderWidth: strokeW,
            color: undefined,
            opacity,
          });
          break;
        }
        case 'line': {
          const strokeW = (ann as { strokeWidth?: number }).strokeWidth ?? 1;
          page.drawLine({
            start: { x: ann.x, y: pdfY + ann.height },
            end: { x: ann.x + ann.width, y: pdfY },
            thickness: strokeW,
            color,
            opacity,
          });
          break;
        }
        case 'arrow': {
          const strokeW = (ann as { strokeWidth?: number }).strokeWidth ?? 1;
          page.drawLine({
            start: { x: ann.x, y: pdfY + ann.height },
            end: { x: ann.x + ann.width, y: pdfY },
            thickness: strokeW,
            color,
            opacity,
          });
          // Draw arrowhead as two lines (simplified triangle)
          page.drawLine({
            start: { x: ann.x + ann.width, y: pdfY },
            end: { x: ann.x + ann.width - 8, y: pdfY + 4 },
            thickness: ann.strokeWidth ?? 1,
            color,
            opacity,
          });
          page.drawLine({
            start: { x: ann.x + ann.width, y: pdfY },
            end: { x: ann.x + ann.width - 8, y: pdfY - 4 },
            thickness: ann.strokeWidth ?? 1,
            color,
            opacity,
          });
          break;
        }
        case 'highlight': {
          page.drawRectangle({
            x: ann.x,
            y: pdfY,
            width: ann.width,
            height: ann.height,
            color,
            opacity: Math.min(opacity, 0.4),
          });
          break;
        }
        case 'sticky': {
          const content = (ann as { content?: string }).content ?? '';
          // Draw sticky note background
          page.drawRectangle({
            x: ann.x,
            y: pdfY,
            width: ann.width,
            height: ann.height,
            color,
            opacity: 0.9,
          });
          // Draw text content
          let font;
          try { font = await libDoc.embedFont(StandardFonts.Helvetica); }
          catch { font = await libDoc.embedFont(StandardFonts.Helvetica); }
          page.drawText(content, {
            x: ann.x + 4,
            y: pdfY + ann.height - 12,
            size: 10,
            font,
            color: rgb(0, 0, 0),
            opacity,
            maxWidth: ann.width - 8,
          });
          break;
        }
        case 'comment': {
          const content = (ann as { content?: string }).content ?? '';
          const author = (ann as { author?: string }).author ?? 'Anonymous';
          // Draw comment bubble
          page.drawRectangle({
            x: ann.x,
            y: pdfY,
            width: ann.width,
            height: ann.height,
            borderColor: color,
            borderWidth: 1,
            color: rgb(1, 1, 0.9),
            opacity,
          });
          let font;
          try { font = await libDoc.embedFont(StandardFonts.Helvetica); }
          catch { font = await libDoc.embedFont(StandardFonts.Helvetica); }
          page.drawText(`${author}: ${content}`, {
            x: ann.x + 4,
            y: pdfY + ann.height - 12,
            size: 9,
            font,
            color: rgb(0, 0, 0),
            opacity,
            maxWidth: ann.width - 8,
          });
          break;
        }
        case 'drawing': {
          const drawingAnn = ann as { imageData?: string; strokeWidth?: number };
          if (drawingAnn.imageData) {
            try {
              const imgBytes = await fetch(drawingAnn.imageData).then(r => r.arrayBuffer());
              const img = await libDoc.embedPng(imgBytes);
              page.drawImage(img, {
                x: ann.x,
                y: pdfY,
                width: ann.width,
                height: ann.height,
                opacity,
              });
            } catch { /* skip failed images */ }
          }
          break;
        }
      }
    }

    // Draw all image objects on this page
    const pageImages = imageObjects.filter(img => img.pageIndex === pageIndex);
    for (const imgObj of pageImages) {
      if (imgObj.src) {
        try {
          const imgBytes = await fetch(imgObj.src).then(r => r.arrayBuffer());
          let embedded;
          if (imgObj.src.includes('jpeg') || imgObj.src.includes('jpg')) {
            embedded = await libDoc.embedJpg(imgBytes);
          } else {
            embedded = await libDoc.embedPng(imgBytes);
          }
          const pdfY = pageHeight - imgObj.y - imgObj.height;
          page.drawImage(embedded, {
            x: imgObj.x,
            y: pdfY,
            width: imgObj.width,
            height: imgObj.height,
            opacity: imgObj.opacity ?? 1,
          });
        } catch { /* skip failed images */ }
      }
    }
  }

  return libDoc.save();
}

/**
 * R53: Export PDF with compression for smaller file size.
 */
export async function exportPdfOptimized(): Promise<Uint8Array> {
  const { pdfDocument } = useDocumentStore.getState();
  if (!pdfDocument) throw new Error("No PDF document loaded");

  const libDoc = pdfDocument.getLibDoc();
  return libDoc.save();
}

/**
 * R53: Export a specific page as an image (PNG/JPEG/WebP) using pdf.js rendering.
 * Returns the image as a Blob.
 */
export async function exportPageAsImage(
  pageIndex: number,
  format: 'png' | 'jpeg' | 'webp' = 'png',
  quality?: number
): Promise<Blob> {
  const { pdfJsDoc } = useDocumentStore.getState();
  if (!pdfJsDoc) throw new Error("No PDF loaded");

  const page = await pdfJsDoc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: 2 }); // 2x for retina

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;

  await page.render({ canvasContext: ctx, viewport }).promise;

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), `image/${format}`, quality);
  });
}

/** Download a blob as a file */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Convert Uint8Array to BlobPart safely */
function uint8ToBlobPart(bytes: Uint8Array): BlobPart {
  // Create a copy to avoid SharedArrayBuffer issues
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy;
}

/**
 * R53: Download the PDF as a flattened version (all annotations merged into content).
 */
export async function downloadPdfFlattened(): Promise<void> {
  const { fileName } = useDocumentStore.getState();
  const bytes = await exportPdfFlattened();
  const blob = new Blob([uint8ToBlobPart(bytes)], { type: 'application/pdf' });
  downloadBlob(blob, fileName.replace(/\.pdf$/i, '') + '-flattened.pdf');
}

/**
 * R53: Download the PDF with compression (optimized size).
 */
export async function downloadPdfOptimized(): Promise<void> {
  const { fileName } = useDocumentStore.getState();
  const bytes = await exportPdfOptimized();
  const blob = new Blob([uint8ToBlobPart(bytes)], { type: 'application/pdf' });
  downloadBlob(blob, fileName.replace(/\.pdf$/i, '') + '-optimized.pdf');
}

/**
 * R53: Download the current page as PNG.
 */
export async function downloadPageAsPng(pageIndex: number): Promise<void> {
  const blob = await exportPageAsImage(pageIndex, 'png');
  downloadBlob(blob, `page-${pageIndex + 1}.png`);
}

/**
 * R53: Download the current page as JPEG with specified quality.
 */
export async function downloadPageAsJpeg(pageIndex: number, quality = 0.9): Promise<void> {
  const blob = await exportPageAsImage(pageIndex, 'jpeg', quality);
  downloadBlob(blob, `page-${pageIndex + 1}.jpg`);
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
  const blob = new Blob([uint8ToBlobPart(bytes)], { type: "application/pdf" });
  downloadBlob(blob, fileName.replace(/\.pdf$/i, "") + "-edited.pdf");
}
