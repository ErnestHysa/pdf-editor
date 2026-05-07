'use client';
import { useRef, useCallback, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist/legacy';

// workerSrc is configured globally in @/lib/pdfWorkerConfig — do NOT set it again here.

interface PdfRendererState {
  pdfDoc: pdfjsLib.PDFDocumentProxy | null;
  pageCount: number;
  isLoading: boolean;
  error: string | null;
}

interface UsePdfRendererReturn extends PdfRendererState {
  loadDocument: (arrayBuffer: ArrayBuffer) => Promise<number>;
  renderPage: (
    pageIndex: number,
    canvas: HTMLCanvasElement,
    scale?: number
  ) => Promise<void>;
  cancelRender: (pageIndex: number) => void;
  destroy: () => void;
}

export function usePdfRenderer(): UsePdfRendererReturn {
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const renderTasksRef = useRef<Map<number, pdfjsLib.RenderTask>>(new Map());
  const [state, setState] = useState<PdfRendererState>({
    pdfDoc: null,
    pageCount: 0,
    isLoading: false,
    error: null,
  });

  const loadDocument = useCallback(async (arrayBuffer: ArrayBuffer): Promise<number> => {
    setState(s => ({ ...s, isLoading: true, error: null }));
    try {
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const doc = await loadingTask.promise;
      pdfDocRef.current = doc;
      setState({ pdfDoc: doc, pageCount: doc.numPages, isLoading: false, error: null });
      return doc.numPages;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load PDF';
      setState(s => ({ ...s, isLoading: false, error: msg }));
      throw err;
    }
  }, []);

  const renderPage = useCallback(async (
    pageIndex: number,
    canvas: HTMLCanvasElement,
    scale: number = 1.0,
  ) => {
    const doc = pdfDocRef.current;
    if (!doc) return;

    // Cancel any existing render for this page
    const existing = renderTasksRef.current.get(pageIndex);
    if (existing) { existing.cancel(); renderTasksRef.current.delete(pageIndex); }

    const page = await doc.getPage(pageIndex + 1); // pdf.js is 1-indexed
    const viewport = page.getViewport({ scale });

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
      intent: 'display',
    });

    renderTasksRef.current.set(pageIndex, renderTask);

    try {
      await renderTask.promise;
      renderTasksRef.current.delete(pageIndex);
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'RenderingCancelledException') return;
      console.error('Render error:', err);
    }
  }, []);

  const cancelRender = useCallback((pageIndex: number) => {
    const task = renderTasksRef.current.get(pageIndex);
    if (task) { task.cancel(); renderTasksRef.current.delete(pageIndex); }
  }, []);

  const destroy = useCallback(() => {
    renderTasksRef.current.forEach(task => task.cancel());
    renderTasksRef.current.clear();
    pdfDocRef.current?.destroy();
    pdfDocRef.current = null;
    setState({ pdfDoc: null, pageCount: 0, isLoading: false, error: null });
  }, []);

  return { ...state, loadDocument, renderPage, cancelRender, destroy };
}
