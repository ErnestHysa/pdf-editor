'use client';
// This MUST be imported before any pdfjs-dist module.
// Set workerSrc globally so all pdfjs instances across the app use the same worker.
import * as pdfjsLib from 'pdfjs-dist/legacy';

if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pdfjsLib.GlobalWorkerOptions as any).workerSrc = '/pdf.worker.min.js';
}
