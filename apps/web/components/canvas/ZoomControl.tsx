'use client';
import { useRef, useEffect, useState } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useDocumentStore } from '@/stores/documentStore';
import { cn } from '@/lib/utils';
import { ZoomIn, ZoomOut, Maximize2, Minimize2, ArrowLeftRight } from 'lucide-react';

export function ZoomControl() {
  const { zoom, setZoom, zoomIn, zoomOut } = useUIStore();
  const { pdfDocument, activePageIndex } = useDocumentStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(el);
    setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, []);

  const pages = pdfDocument?.getPages() ?? [];
  const activePage = pages[activePageIndex ?? 0];
  const pageWidth = activePage?.getWidth() ?? 612;
  const pageHeight = activePage?.getHeight() ?? 792;

  // Subtract padding / offset from inner content width
  const availableWidth = Math.max(containerSize.width - 64, 100);
  const availableHeight = Math.max(containerSize.height - 120, 100);

  const fitWidthZoom = availableWidth / pageWidth;
  const fitPageZoom = Math.min(fitWidthZoom, availableHeight / pageHeight);

  const pct = Math.round(zoom * 100);

  return (
    <div ref={containerRef} className="absolute bottom-6 right-6 flex items-center gap-1 undo-pill px-3 py-1.5 rounded-full z-10" role="group" aria-label="Zoom controls">
      <button
        onClick={zoomOut}
        className="p-1 hover:bg-bg-hover rounded transition-colors text-text-secondary"
        title="Zoom out"
        aria-label="Zoom out"
      >
        <ZoomOut size={14} />
      </button>

      <button
        onClick={() => setZoom(1.0)}
        className="px-2 text-xs font-mono text-text-secondary hover:text-text-primary transition-colors min-w-[44px] text-center"
        title="Reset to 100%"
        aria-label="Reset zoom to 100%"
      >
        {pct}%
      </button>

      <button
        onClick={zoomIn}
        className="p-1 hover:bg-bg-hover rounded transition-colors text-text-secondary"
        title="Zoom in"
        aria-label="Zoom in"
      >
        <ZoomIn size={14} />
      </button>

      <div className="w-px h-4 bg-border mx-0.5" />

      <button
        onClick={() => setZoom(fitWidthZoom)}
        className="p-1 hover:bg-bg-hover rounded transition-colors text-text-secondary"
        title="Fit width"
        aria-label="Fit to width"
      >
        <ArrowLeftRight size={13} />
      </button>

      <button
        onClick={() => setZoom(fitPageZoom)}
        className="p-1 hover:bg-bg-hover rounded transition-colors text-text-secondary"
        title="Fit page"
        aria-label="Fit to page"
      >
        <Minimize2 size={13} />
      </button>
    </div>
  );
}
