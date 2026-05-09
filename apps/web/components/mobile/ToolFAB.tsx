'use client';
import { useState } from 'react';
import { useToolStore } from '@/stores/toolStore';
import { useUIStore } from '@/stores/uiStore';
import { TOOLS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import {
  MousePointer2, Type, Square, Circle, Minus, ArrowRight,
  Highlighter, Underline, Strikethrough, StickyNote,
  MessageSquare, Pencil, Image, Plus, X, Check
} from 'lucide-react';

const iconMap: Record<string, React.ReactNode> = {
  MousePointer2: <MousePointer2 size={20} />,
  Type: <Type size={20} />,
  Square: <Square size={20} />,
  Circle: <Circle size={20} />,
  Minus: <Minus size={20} />,
  ArrowRight: <ArrowRight size={20} />,
  Highlighter: <Highlighter size={20} />,
  Underline: <Underline size={20} />,
  Strikethrough: <Strikethrough size={20} />,
  StickyNote: <StickyNote size={20} />,
  MessageSquare: <MessageSquare size={20} />,
  Pencil: <Pencil size={20} />,
  Image: <Image size={20} />,
  Plus: <Plus size={20} />,
};

export function ToolFAB() {
  const [expanded, setExpanded] = useState(false);
  const { activeTool, setTool } = useToolStore();
  const { setMobileBottomSheet } = useUIStore();

  const visibleTools = TOOLS.slice(0, 6);
  const activeToolData = TOOLS.find(t => t.id === activeTool);

  const handleToolSelect = (toolId: typeof activeTool) => {
    setTool(toolId);
    setExpanded(false);
    setMobileBottomSheet(false);
  };

  return (
    <div className="fixed bottom-[calc(80px+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 z-50">
      {/* Radial menu */}
      {expanded && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 mb-2">
          {visibleTools.map((tool, i) => {
            const angle = ((i / visibleTools.length) * 2 * Math.PI) - Math.PI / 2;
            const radius = 60;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;

            return (
              <button
                key={tool.id}
                onClick={() => handleToolSelect(tool.id as typeof activeTool)}
                className={cn(
                  'tool-fab absolute w-10 h-10 rounded-full flex items-center justify-center transition-all duration-150',
                  activeTool === tool.id
                    ? 'bg-accent text-white'
                    : 'bg-bg-elevated border border-border text-text-secondary hover:border-accent hover:text-accent'
                )}
                style={{
                  transform: `translate(calc(-50% + ${x}px), ${y}px)`,
                }}
                title={tool.label}
                aria-label={tool.label}
              >
                {iconMap[tool.icon]}
              </button>
            );
          })}
        </div>
      )}

      {/* Main FAB */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'tool-fab w-12 h-12 rounded-full flex items-center justify-center transition-all duration-150',
          expanded
            ? 'bg-bg-elevated border border-border text-text-secondary rotate-45'
            : 'bg-accent text-white shadow-lg'
        )}
      >
        {expanded ? <X size={22} /> : activeToolData ? iconMap[activeToolData.icon] : <Plus size={22} />}
      </button>
    </div>
  );
}
