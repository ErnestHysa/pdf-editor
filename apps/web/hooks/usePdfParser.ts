"use client";
import * as pdfjsLib from "pdfjs-dist";
import type { TextObject, BoundingBox, TextStyle } from "@pagecraft/pdf-engine";

interface ParsedTextObject {
  content: string;
  bbox: BoundingBox;
  style: TextStyle;
  rotation: number;
  objectRef: string;
  pageIndex: number;
}

/**
 * PdfParser — parses a pdf.js document and extracts editable text objects.
 * Uses pdf.js's getTextContent() API to get text items with positions,
 * then reconstructs them as high-level TextObject instances.
 */
export class PdfParser {
  private pdfDoc: pdfjsLib.PDFDocumentProxy;

  constructor(pdfDoc: pdfjsLib.PDFDocumentProxy) {
    this.pdfDoc = pdfDoc;
  }

  async parsePage(pageIndex: number): Promise<ParsedTextObject[]> {
    const page = await this.pdfDoc.getPage(pageIndex + 1);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });

    const objects: ParsedTextObject[] = [];

    for (const item of textContent.items) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const op = item as any;
      if (!op.str || op.str.trim() === "") continue;

      const transform = op.transform; // [a, b, c, d, e, f]
      const [a, b, c, d, e, f] = transform ?? [1, 0, 0, 1, 0, 0];

      // Calculate rotation from transform matrix
      let rotation = 0;
      if (Math.abs(b) > 0.01 && Math.abs(c) > 0.01) {
        // Skewed — treat as rotated
        rotation = Math.atan2(b, a) * (180 / Math.PI);
      } else if (Math.abs(b) > 0.01) {
        rotation = 90;
      } else if (Math.abs(c) > 0.01) {
        rotation = 270;
      }

      // Font properties from fontName
      const fontName: string = op.fontName ?? "Helvetica";
      const fontSize = Math.abs(op.height ?? 12);

      // Build bounding box (in PDF coordinates, origin bottom-left)
      // Convert to screen coordinates (origin top-left)
      const x = op.transform?.[4] ?? 0;
      const y = op.transform?.[5] ?? 0;
      const width = Math.abs(a) * (op.width ?? fontSize * op.str.length);
      const height = Math.abs(d) * (op.height ?? fontSize);

      // Convert PDF coords → screen coords
      const screenX = x;
      const screenY = viewport.height - y - height;

      // Determine if bold/italic from font name
      const fontLower = fontName.toLowerCase();
      const isBold = fontLower.includes("bold") || fontLower.includes("black") || fontLower.includes("heavy");
      const isItalic = fontLower.includes("italic") || fontLower.includes("oblique");

      // Determine font family
      let fontFamily = "DM Sans";
      if (fontLower.includes("serif") || fontLower.includes("times") || fontLower.includes("georgia")) {
        fontFamily = "Georgia, serif";
      } else if (fontLower.includes("mono") || fontLower.includes("courier")) {
        fontFamily = "JetBrains Mono, monospace";
      }

      // Color — default to black
      let color = "#1A1A1E";
      if (op.color) {
        const [r, g, b] = Array.isArray(op.color) ? op.color : [0, 0, 0];
        color = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
      }

      objects.push({
        content: op.str,
        bbox: { x: screenX, y: screenY, width, height, rotation },
        style: {
          fontFamily,
          fontSize: Math.max(fontSize, 6),
          fontWeight: isBold ? "bold" : "normal",
          fontStyle: isItalic ? "italic" : "normal",
          color,
          textAlign: "left",
        },
        rotation,
        objectRef: "",
        pageIndex,
      });
    }

    return objects;
  }

  async parseAllPages(): Promise<Map<number, ParsedTextObject[]>> {
    const result = new Map<number, ParsedTextObject[]>();
    for (let i = 0; i < this.pdfDoc.numPages; i++) {
      const objects = await this.parsePage(i);
      result.set(i, objects);
    }
    return result;
  }

  getPageDimensions(pageIndex: number): { width: number; height: number } {
    // Synchronous stub — returns approximate dimensions
    // Use getPageDimensionsAsync for accurate values
    const cached = this.pageDimensionsCache.get(pageIndex);
    if (cached) return cached;
    return { width: 612, height: 792 }; // fallback
  }

  private pageDimensionsCache = new Map<number, { width: number; height: number }>();

  async getPageDimensionsAsync(pageIndex: number): Promise<{ width: number; height: number }> {
    if (this.pageDimensionsCache.has(pageIndex)) {
      return this.pageDimensionsCache.get(pageIndex)!;
    }
    const page = await this.pdfDoc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1.0 });
    const dims = { width: viewport.width, height: viewport.height };
    this.pageDimensionsCache.set(pageIndex, dims);
    return dims;
  }
}
