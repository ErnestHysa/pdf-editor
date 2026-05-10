'use client';
// This MUST be imported before any pdfjs-dist module.
// Set workerSrc globally so all pdfjs instances across the app use the same worker.
import * as pdfjsLib from 'pdfjs-dist/legacy';

if (typeof window !== 'undefined') {
  // pdfjs-dist's GlobalWorkerOptions.workerSrc is a static setter that accepts a string.
  // The explicit cast is safe here since pdfjs-dist v3.x guarantees this API shape.
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
}
