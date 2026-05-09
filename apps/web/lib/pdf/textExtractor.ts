"use client";
import { rgb } from "pdf-lib";

/**
 * Convert hex color string to pdf-lib RGB
 */
export function parseHexColor(hex: string): ReturnType<typeof rgb> {
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

/**
 * Lighten a hex color by mixing it with white. Returns pdf-lib RGB.
 * factor: 0 = original color, 1 = pure white. Defaults to 0.7 (70% white).
 */
export function lightenColor(hex: string, factor = 0.7): ReturnType<typeof rgb> {
  try {
    const clean = hex.replace("#", "");
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    return rgb(r + (1 - r) * factor, g + (1 - g) * factor, b + (1 - b) * factor);
  } catch {
    return rgb(0.95, 0.95, 0.92); // neutral light gray fallback
  }
}

/**
 * Helper to create a PDFArray-like object via context.obj
 */
export function makeArray(context: any, ...values: any[]): any {
  // pdf-lib context.obj can handle plain arrays
  return context.obj([...values]);
}