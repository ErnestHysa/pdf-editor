'use client';
import { useEffect, useState, DragEvent } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useDocumentStore } from '@/stores/documentStore';
import { TopBar } from './TopBar';
import { LeftSidebar } from './LeftSidebar';
import { CanvasArea } from '@/components/canvas/CanvasArea';
import { RightPanel } from '@/components/panels/RightPanel';
import { MobileBottomSheet } from '@/components/mobile/MobileBottomSheet';
import { useDeviceType } from '@/hooks/useDeviceType';
import { useFileHandler } from '@/hooks/useFileHandler';

interface AppShellProps {
  children?: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { leftSidebarOpen, rightPanelOpen, theme } = useUIStore();
  const { pdfDocument } = useDocumentStore();
  const deviceType = useDeviceType();
  const { handleFile } = useFileHandler();
  const [isDragging, setIsDragging] = useState(false);

  // Drag-and-drop handlers
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only accept PDF files
    const hasPdf = e.dataTransfer?.types.includes('Files') &&
      (e.dataTransfer?.items?.[0]?.type === 'application/pdf' ||
       e.dataTransfer?.items?.[0]?.kind === 'file');
    if (hasPdf) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only hide if leaving the root element (not child elements)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const isLeaving = 
      e.clientX <= rect.left ||
      e.clientX >= rect.right ||
      e.clientY <= rect.top ||
      e.clientY >= rect.bottom;
    if (isLeaving) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      handleFile(file).catch(console.error);
    }
  };

  // Apply theme class
  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      if (isMod && e.key === 'k') {
        e.preventDefault();
        useUIStore.getState().setCommandPaletteOpen(true);
      }
      if (e.key === 'Escape') {
        useUIStore.getState().setCommandPaletteOpen(false);
        useDocumentStore.getState().clearSelection();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const shellClass = `flex flex-col h-screen bg-bg-base overflow-hidden ${isDragging ? 'ring-4 ring-inset ring-accent-blue/50' : ''}`;

  if (deviceType === 'mobile') {
    return (
      <div
        className={shellClass}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <TopBar />
        <main className="flex-1 overflow-hidden relative">
          {children}
          <CanvasArea />
        </main>
        {pdfDocument && <MobileBottomSheet />}
      </div>
    );
  }

  return (
    <div
      className={shellClass}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <LeftSidebar open={leftSidebarOpen} />
        <CanvasArea className="flex-1" />
        <RightPanel open={rightPanelOpen} />
      </div>
    </div>
  );
}
