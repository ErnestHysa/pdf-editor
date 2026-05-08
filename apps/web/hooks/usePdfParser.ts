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

/** Form field descriptor extracted from PDF AcroForm */
export interface FormField {
  name: string;
  type: "text" | "checkbox" | "radio" | "button";
  rect: { x: number; y: number; width: number; height: number };
  pageIndex: number;
  value?: string;
  options?: string[];
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

  /**
   * detectFormFields — extracts interactive form field info from the PDF's /AcroForm dictionary.
   * Returns an array of FormField objects; empty array if no form fields exist.
   */
  async detectFormFields(): Promise<FormField[]> {
    const fields: FormField[] = [];
    try {
      const pdfDoc = this.pdfDoc;
      // pdf.js doesn't expose AcroForm directly, so we use the low-level operator list
      // approach: iterate pages and look for widget annotations which represent form fields.
      for (let i = 0; i < pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i + 1);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const annotations = await (page as any).getAnnotations();
        for (const ann of annotations) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const a = ann as any;
          if (!a.rect || a.subtype !== "Widget") continue;

          const typeMap: Record<string, FormField["type"]> = {
            Tx: "text",
            Btn: "button",
            Ch: "checkbox",
            Rd: "radio",
          };
          const fieldType = typeMap[a.fieldType] ?? "text";

          const [x1, y1, x2, y2] = a.rect ?? [0, 0, 0, 0];
          // PDF rect is [x1, y1, x2, y2] where origin is bottom-left
          const pageHeight = (await this.getPageDimensionsAsync(i)).height;

          fields.push({
            name: a.fieldName ?? `field_${fields.length}`,
            type: fieldType as FormField["type"],
            rect: {
              x: x1,
              y: pageHeight - y2, // convert to top-left origin
              width: Math.abs(x2 - x1),
              height: Math.abs(y2 - y1),
            },
            pageIndex: i,
            value: a.fieldValue,
            options: a.options?.map((o: { displayValue: string; exportValue: string }) => o.displayValue),
          });
        }
      }
    } catch {
      // If extraction fails, return empty array (not an error)
    }
    return fields;
  }

  /**
   * detectMissingFonts — returns warning strings for fonts used in the document
   * that are not embedded (i.e. standard 14 fonts or named fonts that rely on
   * the viewer to supply them).
   */
  async detectMissingFonts(): Promise<string[]> {
    const warnings: string[] = [];
    try {
      const pdfDoc = this.pdfDoc;
      const commonStandardFonts = [
        "Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique",
        "Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic",
        "Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique",
        "Symbol", "ZapfDingbats",
      ];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fontList = (pdfDoc as any).fontList ?? [];
      for (const fontRef of fontList) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fontInfo = fontRef as any;
        const fontName: string = fontInfo?.name ?? "";
        const isEmbedded = fontInfo?.embedded ?? fontName.startsWith("+");

        if (!isEmbedded) {
          const baseName = fontName.replace(/[A-Za-z]+/, "").replace(/[-_]\w+/, "");
          if (!commonStandardFonts.includes(baseName) && baseName !== "") {
            warnings.push(
              `Font "${baseName}" is not embedded. The PDF may not render correctly without this font installed on the system.`
            );
          }
        }
      }
    } catch {
      // Ignore errors — just return no warnings
    }
    return warnings;
  }
}
