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
 * Helper to create a PDFArray-like object via context.obj
 */
export function makeArray(context: any, ...values: any[]): any {
  // pdf-lib context.obj can handle plain arrays
  return context.obj([...values]);
}