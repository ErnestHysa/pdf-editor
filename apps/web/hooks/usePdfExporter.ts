"use client";
import { PDFDocument, PDFName, PDFDict, PDFString, PDFObject, PDFArray, PDFRef, rgb, StandardFonts, degrees, PDFOperator, PDFPage } from "pdf-lib";
import { useDocumentStore } from "@/stores/documentStore";
import { createNativeAnnotation, hexToRgbArray } from "@/lib/pdf/annotationBuilder";
import { parseHexColor } from "@/lib/pdf/textExtractor";
import { glyphPreservingEdit } from "@/lib/pdf/glyphEditor";
import { optimizePdf } from "@/lib/pdf/optimizer";

/**
 * C4: Glyph-level text editing for formatting preservation.
 * (Moved to @/lib/pdf/glyphEditor.ts)

/**
 * R65: Writes modified form field values from Zustand store back into the pdf-lib
 * document's AcroForm dictionary. Iterates all fields in the document's /AcroForm/Fields
 * array and updates /V (value) for each matching field name.
 *
 * - Text fields: sets /V to the new string value
 * - Checkboxes: sets /V to /Yes when checked, /Off when unchecked
 * - Radio buttons: sets /V to the selected option value
 */
function applyFormFieldValuesToDoc(libDoc: PDFDocument): void {
  const { formFieldValues } = useDocumentStore.getState();
  const modifiedKeys = Object.keys(formFieldValues);
  if (modifiedKeys.length === 0) return;

  try {
    const acroForm = libDoc.catalog.get(PDFName.of("AcroForm"));
    if (!acroForm || !(acroForm instanceof PDFDict)) return;

    const fieldsRef = acroForm.get(PDFName.of("Fields"));
    if (!fieldsRef) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fields = (fieldsRef as any).value ?? fieldsRef;
    if (!Array.isArray(fields)) return;

    for (const fieldRef of fields) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let fieldDict = (fieldRef as any).lookup?.() ?? fieldRef as any;
      if (!fieldDict || typeof fieldDict.get !== "function") continue;

      const fieldName = fieldDict.get(PDFName.of("T"));
      if (!fieldName) continue;

      const nameStr = String(fieldName);
      if (!(nameStr in formFieldValues)) continue;

      const newValue = formFieldValues[nameStr];
      const fieldType = fieldDict.get(PDFName.of("FT"));
      const typeStr = fieldType ? String(fieldType) : "";

      if (typeStr === "/Btn") {
        // Button field (checkbox or radio)
        if (typeof newValue === "boolean") {
          fieldDict.set(PDFName.of("V"), newValue ? PDFName.of("Yes") : PDFName.of("Off"));
          fieldDict.set(PDFName.of("AS"), newValue ? PDFName.of("Yes") : PDFName.of("Off"));
        } else {
          fieldDict.set(PDFName.of("V"), PDFName.of(String(newValue)));
        }
      } else if (typeStr === "/Tx") {
        // Text field — /V is a PDF string
        fieldDict.set(PDFName.of("V"), PDFString.of(String(newValue)));
      } else if (typeStr === "/Ch") {
        // Choice field — /V is a PDF string
        fieldDict.set(PDFName.of("V"), PDFString.of(String(newValue)));
      } else {
        // Default: try setting /V directly
        fieldDict.set(PDFName.of("V"), typeof newValue === "boolean"
          ? (newValue ? PDFName.of("Yes") : PDFName.of("Off"))
          : PDFName.of(String(newValue)));
      }
    }
  } catch (e) {
    console.warn("[R65] Failed to apply form field values:", e);
  }
}

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

  applyFormFieldValuesToDoc(libDoc);
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
    for (const imgObj of imageObjects) {
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

  applyFormFieldValuesToDoc(libDoc);
  return libDoc.save();
}

/**
 * R53: Export PDF with compression for smaller file size.
 */
export async function exportPdfOptimized(): Promise<Uint8Array> {
  const { pdfDocument } = useDocumentStore.getState();
  if (!pdfDocument) throw new Error("No PDF document loaded");

  const libDoc = pdfDocument.getLibDoc();
  applyFormFieldValuesToDoc(libDoc);
  return optimizePdf(libDoc);
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

/**
 * R61: Native PDF annotation objects via draw methods.
 * Visual annotations are drawn directly on the page using pdf-lib's draw API.
 * Sticky notes and comments are rendered as small icon+text overlays.
 * This achieves the same visual output as native PDF annotations while
 * remaining fully compatible across all PDF readers.
 */
export async function exportPdfWithNativeAnnotations(): Promise<Uint8Array> {
  const { pdfDocument, annotations, textObjects } = useDocumentStore.getState();
  if (!pdfDocument) throw new Error("No PDF document loaded");

  const libDoc = pdfDocument.getLibDoc();
  const pages = libDoc.getPages();

  const annByPage = new Map<number, typeof annotations>();
  for (const ann of annotations) {
    const list = annByPage.get(ann.pageIndex) ?? [];
    list.push(ann);
    annByPage.set(ann.pageIndex, list);
  }

  const textByPage = new Map<number, typeof textObjects>();
  for (const obj of textObjects) {
    const list = textByPage.get(obj.pageIndex) ?? [];
    list.push(obj);
    textByPage.set(obj.pageIndex, list);
  }

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex];
    const pageHeight = page.getHeight();

    // Draw text objects (these are NOT annotations, keep as-is)
    const pageTexts = textByPage.get(pageIndex) ?? [];
    for (const textObj of pageTexts) {
      const font = await libDoc.embedFont(StandardFonts.Helvetica);
      const color = parseHexColor(textObj.color);
      const size = textObj.fontSize ?? 14;
      const pdfY = pageHeight - textObj.y - (textObj.height ?? size);
      page.drawText(textObj.content ?? "", {
        x: textObj.x, y: pdfY, size,
        font, color,
        rotate: textObj.rotation ? degrees(textObj.rotation) : degrees(0),
      });
    }

    // Create native PDF annotations for this page
    const pageAnnotations = annByPage.get(pageIndex) ?? [];
    const annotationRefs: PDFRef[] = [];

    for (const ann of pageAnnotations) {
      // drawing type: embed as image (not a native PDF annotation type)
      if (ann.type === 'drawing') {
        const imgData = (ann as any).imageData;
        if (imgData) {
          try {
            const raw = imgData.startsWith("data:image")
              ? await fetch(imgData).then(r => r.arrayBuffer()).then(ab => new Uint8Array(ab))
              : imgData;
            const jpgImg = raw[0] === 0xff && raw[1] === 0xd8
              ? await libDoc.embedJpg(raw) : await libDoc.embedPng(raw);
            const pdfBottom = pageHeight - ann.y - ann.height;
            page.drawImage(jpgImg, {
              x: ann.x, y: pdfBottom,
              width: ann.width, height: ann.height,
              opacity: ann.opacity ?? 1,
            });
          } catch { /* skip */ }
        }
        continue;
      }

      // For all other annotation types, create real PDF /Annot objects
      const ref = createNativeAnnotation(libDoc, page, ann);
      if (ref) annotationRefs.push(ref);
    }

    // Register all annotation refs with the page's /Annots array
    if (annotationRefs.length > 0) {
      const existingAnnots = page.node.get(PDFName.of('Annots'));
      if (existingAnnots) {
        // Merge with existing annotations
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existing = (existingAnnots as any).value ?? existingAnnots;
        if (Array.isArray(existing)) {
          for (const ref of annotationRefs) {
            existing.push(ref);
          }
        }
      } else {
        // Set new Annots array on the page
        page.node.set(PDFName.of('Annots'), libDoc.context.obj(annotationRefs));
      }
    }
  }

  applyFormFieldValuesToDoc(libDoc);
  const bytes = await libDoc.save();
  useDocumentStore.getState().setDirty(false);
  return bytes;
}

export async function downloadPdfWithChanges(): Promise<void> {
  const { fileName } = useDocumentStore.getState();
  const bytes = await exportPdfWithChanges();
  const blob = new Blob([uint8ToBlobPart(bytes)], { type: "application/pdf" });
  downloadBlob(blob, fileName.replace(/\.pdf$/i, "") + "-edited.pdf");
}
