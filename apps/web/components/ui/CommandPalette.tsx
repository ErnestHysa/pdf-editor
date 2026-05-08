"use client";
import { useEffect, useState, useRef, useCallback } from 'react';
import { useToolStore } from '@/stores/toolStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useUIStore } from '@/stores/uiStore';
import { downloadPdfWithChanges } from '@/hooks/usePdfExporter';
import { cn } from '@/lib/utils';

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  category: string;
  action: () => void;
}

export function CommandPalette({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { setTool } = useToolStore();
  const { undo, redo, push } = useHistoryStore();
  const { pdfDocument } = useDocumentStore();
  const { clearSelection } = useDocumentStore();
  const { setZoom } = useUIStore();

  const commands: Command[] = [
    // Tool switching
    { id: 'tool-select', label: 'Select Tool', shortcut: 'V', category: 'Tools', action: () => setTool('select') },
    { id: 'tool-text', label: 'Text Tool', shortcut: 'T', category: 'Tools', action: () => setTool('text') },
    { id: 'tool-rectangle', label: 'Rectangle Tool', shortcut: 'R', category: 'Tools', action: () => setTool('rectangle') },
    { id: 'tool-ellipse', label: 'Ellipse Tool', shortcut: 'E', category: 'Tools', action: () => setTool('ellipse') },
    { id: 'tool-highlight', label: 'Highlight Tool', shortcut: 'H', category: 'Tools', action: () => setTool('highlight') },
    { id: 'tool-sticky', label: 'Sticky Note Tool', shortcut: 'N', category: 'Tools', action: () => setTool('sticky') },
    { id: 'tool-comment', label: 'Comment Tool', shortcut: 'C', category: 'Tools', action: () => setTool('comment') },
    { id: 'tool-draw', label: 'Draw Tool', shortcut: 'D', category: 'Tools', action: () => setTool('draw') },
    { id: 'tool-image', label: 'Image Tool', shortcut: 'I', category: 'Tools', action: () => setTool('image') },
    // Zoom
    { id: 'zoom-in', label: 'Zoom In', shortcut: '=', category: 'View', action: () => setZoom(Math.min(5, (useUIStore.getState().zoom ?? 1) * 1.25)) },
    { id: 'zoom-out', label: 'Zoom Out', shortcut: '-', category: 'View', action: () => setZoom(Math.max(0.25, (useUIStore.getState().zoom ?? 1) / 1.25)) },
    { id: 'zoom-fit', label: 'Fit to Width', category: 'View', action: () => setZoom(1) },
    // Actions
    { id: 'undo', label: 'Undo', shortcut: 'Ctrl+Z', category: 'Actions', action: () => undo() },
    { id: 'redo', label: 'Redo', shortcut: 'Ctrl+Shift+Z', category: 'Actions', action: () => redo() },
    { id: 'clear-selection', label: 'Clear Selection', shortcut: 'Esc', category: 'Actions', action: () => clearSelection() },
    { id: 'download', label: 'Download PDF', category: 'File', action: () => pdfDocument && downloadPdfWithChanges() },
  ];

  const filtered = query
    ? commands.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          c.category.toLowerCase().includes(query.toLowerCase())
      )
    : commands;

  const grouped = filtered.reduce((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {} as Record<string, Command[]>);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const execute = useCallback((cmd: Command) => {
    cmd.action();
    if (onClose) onClose();
  }, [onClose]);

  if (!open) {
    return (
      <button
        onClick={onClose}
        className="fixed top-3 right-20 z-50 px-3 py-1.5 rounded-lg bg-elevated border border-border text-xs text-secondary hover:text-primary hover:border-border-strong transition-colors hidden md:flex items-center gap-2"
      >
        <span>⌘K</span>
        <span>Command</span>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg mx-4 rounded-xl bg-elevated border border-border shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-4 border-b border-border">
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full py-4 bg-transparent text-primary placeholder:text-tertiary outline-none text-sm"
          />
        </div>
        <div className="max-h-80 overflow-y-auto py-2">
          {Object.entries(grouped).map(([category, cmds]) => (
            <div key={category}>
              <div className="px-4 py-1.5 text-xs font-medium text-secondary uppercase tracking-wider">
                {category}
              </div>
              {cmds.map((cmd) => {
                const globalIdx = filtered.indexOf(cmd);
                return (
                  <button
                    key={cmd.id}
                    onClick={() => execute(cmd)}
                    className={cn(
                      'w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors',
                      globalIdx === selectedIndex
                        ? 'bg-accent/20 text-accent'
                        : 'text-primary hover:bg-hover'
                    )}
                    onMouseEnter={() => setSelectedIndex(globalIdx)}
                  >
                    <span>{cmd.label}</span>
                    {cmd.shortcut && (
                      <kbd className="text-xs text-secondary bg-surface px-1.5 py-0.5 rounded border border-border font-mono">
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-secondary">
              No commands found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}