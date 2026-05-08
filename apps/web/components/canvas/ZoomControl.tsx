'use client';
import { useUIStore } from '@/stores/uiStore';
import { cn } from '@/lib/utils';
import { ZoomIn, ZoomOut, Maximize2, Minimize2 } from 'lucide-react';

export function ZoomControl() {
  const { zoom, setZoom, zoomIn, zoomOut } = useUIStore();
  const pct = Math.round(zoom * 100);

  return (
    <div className="absolute bottom-6 right-6 flex items-center gap-1 undo-pill px-3 py-1.5 rounded-full z-10" role="group" aria-label="Zoom controls">
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
        onClick={() => setZoom(1.0)}
        className="p-1 hover:bg-bg-hover rounded transition-colors text-text-secondary"
        title="Fit width"
        aria-label="Fit to width"
      >
        <Maximize2 size={13} />
      </button>
    </div>
  );
}
