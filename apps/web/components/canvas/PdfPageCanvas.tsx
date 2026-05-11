'use client';
import { useEffect, useRef, useState, memo } from 'react';
import { useDocumentStore } from '@/stores/documentStore';
import { cn } from '@/lib/utils';

interface PdfPageCanvasProps {
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  renderScale: number;
}

// ── pdf.js canvas rendering ──────────────────────────────────────
export const PdfPageCanvas = memo(function PdfPageCanvas({
  pageIndex,
  pageWidth,
  pageHeight,
  renderScale,
}: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfJsDoc = useDocumentStore((s) => s.pdfJsDoc);
  const pageReloadTimestamp = useDocumentStore((s) => s.targetedReloads[pageIndex]);
  const clearPartialReload = useDocumentStore((s) => s.clearPartialReload);
  const [pageReloadKey, setPageReloadKey] = useState(0);

  // Re-render this specific page when targetedReloads[pageIndex] changes
  useEffect(() => {
    if (pageReloadTimestamp) {
      setPageReloadKey((k) => k + 1);
      // Clear the entry to avoid stale entries accumulating
      clearPartialReload(pageIndex);
    }
  }, [pageReloadTimestamp, pageIndex, clearPartialReload]);

  useEffect(() => {
    if (!canvasRef.current || !pdfJsDoc) return;
    let cancelled = false;
    (async () => {
      const pdfPage = await pdfJsDoc.getPage(pageIndex + 1);
      if (cancelled) return;
      const viewport = pdfPage.getViewport({ scale: renderScale, renderInteractiveForms: false });
      const canvas = canvasRef.current!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      await pdfPage.render({ canvasContext: ctx, viewport }).promise;
    })();
    return () => {
      cancelled = true;
      // Explicit canvas cleanup to avoid memory leaks on large PDFs (#21)
      if (canvasRef.current) {
        canvasRef.current.width = 0;
        canvasRef.current.height = 0;
      }
    };
    // pageReloadKey is intentionally omitted — we re-render via targetedReloads effect above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfJsDoc, pageIndex, renderScale, pageReloadKey]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0"
      style={{ width: pageWidth, height: pageHeight }}
    />
  );
});