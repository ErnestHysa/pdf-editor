'use client';
import { useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface UsePdfRendererOptions {
  scale?: number;
  onPageRendered?: (pageIndex: number) => void;
}

export function usePdfRenderer(options: UsePdfRendererOptions = {}) {
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const renderTasksRef = useRef<Map<number, pdfjsLib.RenderTask>>(new Map());

  const loadDocument = useCallback(async (arrayBuffer: ArrayBuffer) => {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const doc = await loadingTask.promise;
    pdfDocRef.current = doc;
    return doc;
  }, []);

  const renderPage = useCallback(async (
    pageIndex: number,
    canvas: HTMLCanvasElement,
    scale: number = 1
  ) => {
    const doc = pdfDocRef.current;
    if (!doc) return;

    // Cancel any existing render for this page
    const existing = renderTasksRef.current.get(pageIndex);
    if (existing) existing.cancel();

    const page = await doc.getPage(pageIndex + 1); // pdf.js is 1-indexed
    const viewport = page.getViewport({ scale: scale * 2 }); // 2x for retina

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
    });

    renderTasksRef.current.set(pageIndex, renderTask);

    try {
      await renderTask.promise;
      options.onPageRendered?.(pageIndex);
    } catch (err: any) {
      if (err?.name === 'RenderingCancelledException') return;
      console.error('Render error:', err);
    }
  }, [options]);

  const cancelRender = useCallback((pageIndex: number) => {
    const task = renderTasksRef.current.get(pageIndex);
    if (task) {
      task.cancel();
      renderTasksRef.current.delete(pageIndex);
    }
  }, []);

  const destroy = useCallback(() => {
    renderTasksRef.current.forEach(task => task.cancel());
    renderTasksRef.current.clear();
    pdfDocRef.current?.destroy();
    pdfDocRef.current = null;
  }, []);

  return {
    loadDocument,
    renderPage,
    cancelRender,
    destroy,
    getPageCount: () => pdfDocRef.current?.numPages ?? 0,
  };
}
