'use client';
import { useRef, useCallback } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useDocumentStore } from '@/stores/documentStore';
import { Plus, ChevronLeft } from 'lucide-react';
import { PageThumbnails } from '@/components/canvas/PageThumbnails';
import { cn } from '@/lib/utils';

interface LeftSidebarProps {
  open: boolean;
}

export function LeftSidebar({ open }: LeftSidebarProps) {
  const { activePanel, setActivePanel } = useUIStore();
  const { pdfDocument } = useDocumentStore();

  if (!open) return null;

  return (
    <aside className="w-60 shrink-0 bg-bg-surface border-r border-border flex flex-col overflow-hidden animate-slide-in">
      {/* Header */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-border shrink-0">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Pages
        </span>
        {pdfDocument && (
          <span className="text-xs text-text-tertiary font-mono">
            {pdfDocument.getPageCount()}
          </span>
        )}
      </div>

      {/* Page thumbnails */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {pdfDocument ? (
          <PageThumbnails
            pages={pdfDocument.getPages()}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-text-tertiary text-sm p-4 text-center">
            <p>No document open.</p>
            <p className="mt-1 text-xs">Drop a PDF or click Open.</p>
          </div>
        )}
      </div>
    </aside>
  );
}
