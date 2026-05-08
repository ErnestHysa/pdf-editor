'use client';
import { useRef, useCallback } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useToolStore } from '@/stores/toolStore';
import { ZoomControl } from '@/components/canvas/ZoomControl';
import { PageCanvas } from '@/components/canvas/PageCanvas';
import { useDeviceType } from '@/hooks/useDeviceType';
import { cn } from '@/lib/utils';

interface CanvasAreaProps {
  className?: string;
}

export function CanvasArea({ className }: CanvasAreaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { zoom, setZoom, panOffset, setPanOffset } = useUIStore();
  const { pdfDocument, activePageIndex, setActivePage } = useDocumentStore();
  const { isDrawing } = useToolStore();
  const deviceType = useDeviceType();
  const pages = pdfDocument?.getPages() ?? [];

  // Panning state
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });

  const handleWheel: React.WheelEventHandler<HTMLDivElement> = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Cursor position in page coordinates BEFORE zoom
      const cursorX = (e.clientX - rect.left - panOffset.x) / zoom;
      const cursorY = (e.clientY - rect.top - panOffset.y) / zoom;
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newZoom = Math.min(Math.max(zoom + delta, 0.25), 4.0);
      setZoom(newZoom);
      // Cursor position in page coordinates AFTER zoom
      const newCursorX = (e.clientX - rect.left - panOffset.x) / newZoom;
      const newCursorY = (e.clientY - rect.top - panOffset.y) / newZoom;
      // Adjust panOffset to keep cursor at same page position
      setPanOffset({
        x: panOffset.x - (newCursorX - cursorX) * newZoom,
        y: panOffset.y - (newCursorY - cursorY) * newZoom,
      });
    }
  }, [zoom, panOffset, setZoom, setPanOffset]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && !isDrawing)) {
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY, offsetX: panOffset.x, offsetY: panOffset.y };
    }
  }, [isDrawing, panOffset]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setPanOffset({ x: panStart.current.offsetX + dx, y: panStart.current.offsetY + dy });
  }, [setPanOffset]);

  const onMouseUp = useCallback(() => { isPanning.current = false; }, []);

  return (
    <div
      ref={containerRef}
      className={cn('relative overflow-auto bg-bg-base', isPanning.current ? 'cursor-grabbing' : 'cursor-default', className)}
      style={{ touchAction: 'none' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onWheel={handleWheel}
    >
      <div className="pt-8 pb-24 px-8 min-h-full" style={{
        transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
        transformOrigin: 'top center',
      }}>
        {pages.length === 0 ? (
          <div className="flex items-center justify-center h-full min-h-[600px]">
            <p className="text-text-tertiary text-sm">Open a PDF to start editing</p>
          </div>
        ) : (
          pages.map((page, i) => (
            <PageCanvas
              key={i}
              page={page}
              pageIndex={i}
              isActive={i === activePageIndex}
              onPageClick={() => setActivePage(i)}
              zoom={zoom}
            />
          ))
        )}
      </div>

      {pages.length > 0 && deviceType !== 'mobile' && (
        <ZoomControl />
      )}
    </div>
  );
}