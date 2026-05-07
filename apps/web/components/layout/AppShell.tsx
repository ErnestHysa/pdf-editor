'use client';
import { useEffect } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useDocumentStore } from '@/stores/documentStore';
import { TopBar } from './TopBar';
import { LeftSidebar } from './LeftSidebar';
import { CanvasArea } from '@/components/canvas/CanvasArea';
import { RightPanel } from '@/components/panels/RightPanel';
import { MobileBottomSheet } from '@/components/mobile/MobileBottomSheet';
import { useDeviceType } from '@/hooks/useDeviceType';

interface AppShellProps {
  children?: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { leftSidebarOpen, rightPanelOpen, theme } = useUIStore();
  const { pdfDocument } = useDocumentStore();
  const deviceType = useDeviceType();

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

  if (deviceType === 'mobile') {
    return (
      <div className="flex flex-col h-screen bg-bg-base overflow-hidden">
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
    <div className="flex flex-col h-screen bg-bg-base overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <LeftSidebar open={leftSidebarOpen} />
        <CanvasArea className="flex-1" />
        <RightPanel open={rightPanelOpen} />
      </div>
    </div>
  );
}
