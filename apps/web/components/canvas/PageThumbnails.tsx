'use client';
import { useRef } from 'react';
import { useDocumentStore } from '@/stores/documentStore';
import { useUIStore } from '@/stores/uiStore';
import type { Page } from '@pagecraft/pdf-engine';
import { cn } from '@/lib/utils';

interface PageThumbnailsProps {
  pages: Page[];
}

export function PageThumbnails({ pages }: PageThumbnailsProps) {
  const { activePageIndex, setActivePage } = useDocumentStore();
  const { zoom } = useUIStore();
  const containerRef = useRef<HTMLDivElement>(null);

  const THUMB_SCALE = 0.25;

  return (
    <div ref={containerRef} className="p-2 flex flex-col gap-1">
      {pages.map((page, i) => (
        <button
          key={i}
          onClick={() => setActivePage(i)}
          className={cn(
            'relative rounded overflow-hidden border transition-all duration-150',
            'hover:border-border-strong hover:scale-[1.02]',
            i === activePageIndex
              ? 'border-accent ring-1 ring-accent-muted'
              : 'border-border'
          )}
          style={{ aspectRatio: `${page.getWidth()} / ${page.getHeight()}` }}
        >
          {/* Thumbnail render — simplified for now */}
          <div
            className="absolute inset-0 bg-white"
            style={{
              transform: `scale(${THUMB_SCALE})`,
              transformOrigin: 'top left',
              width: page.getWidth(),
              height: page.getHeight(),
            }}
          />
          <span className="absolute bottom-0.5 right-1.5 text-2xs font-mono text-text-tertiary bg-bg-elevated/80 px-1 rounded">
            {i + 1}
          </span>
        </button>
      ))}
    </div>
  );
}
