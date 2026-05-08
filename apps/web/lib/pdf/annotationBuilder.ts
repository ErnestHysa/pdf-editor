"use client";
import { PDFDocument, PDFName, PDFDict, PDFString, PDFRef, PDFPage } from "pdf-lib";

/**
 * Parse hex color to [r, g, b] array in 0-1 range
 */
export function hexToRgbArray(hex: string): [number, number, number] {
  try {
    const clean = hex.replace("#", "");
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    return [r, g, b];
  } catch {
    return [1, 1, 0];
  }
}

/**
 * Creates a real PDF annotation dictionary and registers it in the document.
 * Returns the PDFRef to the annotation, or null on failure.
 *
 * Uses doc.context.obj() to create native PDF /Annot dicts:
 * - HIGHLIGHT/UNDERLINE/STRIKETHROUGH: /QuadPoints for precise text markup
 * - STICKY/COMMENT: /Text subtype with /Contents and /Name icon
 * - RECTANGLE/ELLIPSE/LINE/ARROW: /Square /Circle /Line with /Rect or /L
 */
export function createNativeAnnotation(
  doc: PDFDocument,
  page: PDFPage,
  ann: any
): PDFRef | null {
  try {
    const context = doc.context;
    const pageHeight = page.getHeight();

    // Convert DOM top-left coords to PDF bottom-left coords
    const pdfBottom = pageHeight - ann.y - ann.height;
    const rect: [number, number, number, number] = [ann.x, pdfBottom, ann.x + ann.width, pdfBottom + ann.height];

    // [r, g, b] color array in 0-1 range
    const colorArr: [number, number, number] = hexToRgbArray(ann.color ?? '#FFFF00');

    // Stroke width for shape annotations
    const strokeW = ann.strokeWidth ?? 1;

    let annotationDict: PDFDict;

    switch (ann.type) {
      case 'highlight': {
        // QuadPoints: [x1 y1 x2 y2 x3 y3 x4 y4] for each corner of highlight region
        // PDF expects quadrilateral in reading order
        const quadPoints = [
          ann.x, pdfBottom + ann.height,       // top-left
          ann.x + ann.width, pdfBottom + ann.height, // top-right
          ann.x, pdfBottom,                    // bottom-left
          ann.x + ann.width, pdfBottom,        // bottom-right
        ];
        annotationDict = context.obj({
          Type: PDFName.of('Annot'),
          Subtype: PDFName.of('Highlight'),
          QuadPoints: quadPoints,
          C: [colorArr[0], colorArr[1], colorArr[2]],
          P: page.node,
        });
        break;
      }
      case 'underline': {
        // Underline is a horizontal line below text
        const quadPoints = [
          ann.x, pdfBottom + 2,
          ann.x + ann.width, pdfBottom + 2,
          ann.x, pdfBottom,
          ann.x + ann.width, pdfBottom,
        ];
        annotationDict = context.obj({
          Type: PDFName.of('Annot'),
          Subtype: PDFName.of('Underline'),
          QuadPoints: quadPoints,
          C: [colorArr[0], colorArr[1], colorArr[2]],
          P: page.node,
        });
        break;
      }
      case 'strikethrough': {
        // Strikethrough is a horizontal line through the middle
        const midY = pdfBottom + ann.height / 2;
        const quadPoints = [
          ann.x, midY + 2,
          ann.x + ann.width, midY + 2,
          ann.x, midY - 2,
          ann.x + ann.width, midY - 2,
        ];
        annotationDict = context.obj({
          Type: PDFName.of('Annot'),
          Subtype: PDFName.of('StrikeOut'),
          QuadPoints: quadPoints,
          C: [colorArr[0], colorArr[1], colorArr[2]],
          P: page.node,
        });
        break;
      }
      case 'sticky': {
        // Sticky note: /Text subtype with /Contents and /Name /Note
        annotationDict = context.obj({
          Type: PDFName.of('Annot'),
          Subtype: PDFName.of('Text'),
          Rect: [rect[0], rect[1], rect[2], rect[3]],
          Contents: PDFString.of(ann.content ?? ''),
          C: [colorArr[0], colorArr[1], colorArr[2]],
          P: page.node,
          Name: PDFName.of('Note'),
        });
        break;
      }
      case 'comment': {
        // Comment: similar to sticky but /Name /Comment
        annotationDict = context.obj({
          Type: PDFName.of('Annot'),
          Subtype: PDFName.of('Text'),
          Rect: [rect[0], rect[1], rect[2], rect[3]],
          Contents: PDFString.of(ann.content ?? ''),
          C: [colorArr[0], colorArr[1], colorArr[2]],
          P: page.node,
          Name: PDFName.of('Comment'),
        });
        break;
      }
      case 'rectangle': {
        const filled = ann.filled ?? false;
        annotationDict = context.obj({
          Type: PDFName.of('Annot'),
          Subtype: PDFName.of('Square'),
          Rect: [rect[0], rect[1], rect[2], rect[3]],
          BS: context.obj({
            Type: PDFName.of('Border'),
            W: strokeW,
          }),
          C: [colorArr[0], colorArr[1], colorArr[2]],
          P: page.node,
          ...(filled ? { IC: [colorArr[0], colorArr[1], colorArr[2]] } : {}),
        });
        break;
      }
      case 'ellipse': {
        annotationDict = context.obj({
          Type: PDFName.of('Annot'),
          Subtype: PDFName.of('Circle'),
          Rect: [rect[0], rect[1], rect[2], rect[3]],
          BS: context.obj({
            Type: PDFName.of('Border'),
            W: strokeW,
          }),
          C: [colorArr[0], colorArr[1], colorArr[2]],
          P: page.node,
        });
        break;
      }
      case 'line': {
        // Line from (x, y+height) to (x+width, y) - diagonal by default
        const L = [ann.x, pdfBottom + ann.height, ann.x + ann.width, pdfBottom];
        annotationDict = context.obj({
          Type: PDFName.of('Annot'),
          Subtype: PDFName.of('Line'),
          L: L,
          BS: context.obj({
            Type: PDFName.of('Border'),
            W: strokeW,
          }),
          C: [colorArr[0], colorArr[1], colorArr[2]],
          P: page.node,
        });
        break;
      }
      case 'arrow': {
        // Arrow with arrowhead at end point
        const L = [ann.x, pdfBottom + ann.height, ann.x + ann.width, pdfBottom];
        annotationDict = context.obj({
          Type: PDFName.of('Annot'),
          Subtype: PDFName.of('Line'),
          L: L,
          LE: [PDFName.of('None'), PDFName.of('Arrow')],
          BS: context.obj({
            Type: PDFName.of('Border'),
            W: strokeW,
          }),
          C: [colorArr[0], colorArr[1], colorArr[2]],
          P: page.node,
        });
        break;
      }
      default:
        return null;
    }

    return context.register(annotationDict);
  } catch (e) {
    console.warn('[createNativeAnnotation] Failed to create annotation:', e);
    return null;
  }
}