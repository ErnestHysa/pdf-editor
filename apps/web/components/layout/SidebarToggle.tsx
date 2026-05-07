'use client';
import { PanelLeft } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { cn } from '@/lib/utils';

export function SidebarToggle() {
  const { leftSidebarOpen, toggleLeftSidebar } = useUIStore();

  return (
    <button
      onClick={toggleLeftSidebar}
      className={cn(
        'p-2 rounded transition-all duration-200',
        leftSidebarOpen
          ? 'bg-bg-elevated text-text-primary'
          : 'bg-bg-surface border border-border text-text-secondary hover:text-text-primary'
      )}
      title={leftSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
    >
      <PanelLeft size={16} />
    </button>
  );
}
