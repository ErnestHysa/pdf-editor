'use client';
import { useRef, useEffect, useState, useCallback, forwardRef } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useToolStore } from '@/stores/toolStore';
import { useHistoryStore } from '@/stores/historyStore';
import { usePdfRenderer } from '@/hooks/usePdfRenderer';
import { ZoomControl } from './ZoomControl';
import { PageRenderer } from './PageRenderer';
import { SelectionOverlay } from './SelectionOverlay';
import { cn } from '@/lib/utils';

interface CanvasAreaProps {
  className?: string;
}

export function CanvasArea({ className }: CanvasAreaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { zoom, setZoom, panOffset, setPanOffset } = useUIStore();
  const { pdfDocument, activePageIndex } = useDocumentStore();
  const { activeTool, isDrawing, setDrawing } = useToolStore();
  const pages = pdfDocument?.getPages() ?? [];

  // Panning state
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });

  // Zoom with scroll
  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(zoom + delta);
    }
  }, [zoom, setZoom]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Pan start
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && activeTool === 'select' && !isDrawing)) {
      // Middle mouse or space+drag
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, offsetX: panOffset.x, offsetY: panOffset.y };
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setPanOffset({ x: panStart.current.offsetX + dx, y: panStart.current.offsetY + dy });
  };

  const onMouseUp = () => setIsPanning(false);

  const canvasStyle: React.CSSProperties = {
    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
    transformOrigin: 'top center',
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'canvas-area relative overflow-auto bg-bg-base',
        isPanning ? 'cursor-grabbing' : 'cursor-default',
        className
      )}
      style={{ touchAction: 'none' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {/* Canvas pages */}
      <div className="pt-8 pb-24 px-8 min-h-full" style={canvasStyle}>
        {pages.length === 0 ? (
          <div className="flex items-center justify-center h-full min-h-[600px]">
            <p className="text-text-tertiary text-sm">Open a PDF to start editing</p>
          </div>
        ) : (
          pages.map((page, i) => (
            <PageRenderer
              key={i}
              page={page}
              pageIndex={i}
              isActive={i === activePageIndex}
              scale={zoom}
            />
          ))
        )}
      </div>

      {/* Zoom control */}
      {pages.length > 0 && (
        <ZoomControl />
      )}
    </div>
  );
}
