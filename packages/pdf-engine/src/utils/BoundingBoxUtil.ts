import type { BoundingBox } from '../types';

export class BoundingBoxUtil {
  /**
   * Check if point (px, py) is inside bounding box.
   * Handles rotation (0, 90, 180, 270 degrees).
   */
  static containsPoint(bbox: BoundingBox, px: number, py: number): boolean {
    const { x, y, width, height, rotation = 0 } = bbox;

    if (rotation === 0) {
      return px >= x && px <= x + width && py >= y && py <= y + height;
    }

    // Rotate point into bbox's local coordinate system
    const cx = x + width / 2;
    const cy = y + height / 2;
    const rad = (-rotation * Math.PI) / 180;
    const dx = px - cx;
    const dy = py - cy;
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad) + cx;
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad) + cy;

    return rx >= x && rx <= x + width && ry >= y && ry <= y + height;
  }

  /**
   * Check if two bounding boxes overlap.
   */
  static overlaps(a: BoundingBox, b: BoundingBox): boolean {
    return !(
      a.x + a.width < b.x ||
      b.x + b.width < a.x ||
      a.y + a.height < b.y ||
      b.y + b.height < a.y
    );
  }

  /**
   * Compute the intersection of two bounding boxes.
   */
  static intersect(a: BoundingBox, b: BoundingBox): BoundingBox | null {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const width = Math.min(a.x + a.width, b.x + b.width) - x;
    const height = Math.min(a.y + a.height, b.y + b.height) - y;
    if (width <= 0 || height <= 0) return null;
    return { x, y, width, height };
  }

  /**
   * Scale a bounding box around its center.
   */
  static scale(bbox: BoundingBox, factor: number): BoundingBox {
    const cx = bbox.x + bbox.width / 2;
    const cy = bbox.y + bbox.height / 2;
    return {
      x: cx - (bbox.width * factor) / 2,
      y: cy - (bbox.height * factor) / 2,
      width: bbox.width * factor,
      height: bbox.height * factor,
      rotation: bbox.rotation,
    };
  }

  /**
   * Convert bbox from PDF coordinate system (origin bottom-left)
   * to canvas screen coordinates (origin top-left).
   */
  static pdfToScreen(bbox: BoundingBox, pageHeight: number): BoundingBox {
    return {
      x: bbox.x,
      y: pageHeight - bbox.y - bbox.height,
      width: bbox.width,
      height: bbox.height,
      rotation: bbox.rotation,
    };
  }

  /**
   * Convert bbox from screen coordinates to PDF coordinates.
   */
  static screenToPdf(bbox: BoundingBox, pageHeight: number): BoundingBox {
    return {
      x: bbox.x,
      y: pageHeight - bbox.y - bbox.height,
      width: bbox.width,
      height: bbox.height,
      rotation: bbox.rotation,
    };
  }
}
