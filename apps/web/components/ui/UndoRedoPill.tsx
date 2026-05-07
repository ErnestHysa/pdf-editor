"use client";
import { useEffect, useState } from 'react';
import { useHistoryStore } from '@/stores/historyStore';
import { useDocumentStore } from '@/stores/documentStore';
import { cn } from '@/lib/utils';

export function UndoRedoPill() {
  const { undo, redo, canUndo, canRedo, getLastAction } = useHistoryStore();
  const { pdfDocument } = useDocumentStore();
  const [visible, setVisible] = useState(false);
  const [lastLabel, setLastLabel] = useState<string | null>(null);

  // Show the pill when there are undoable actions
  useEffect(() => {
    if (canUndo()) {
      setVisible(true);
      const action = getLastAction();
      setLastLabel(action?.label ?? null);
    } else {
      setVisible(false);
    }
  }, [canUndo, canRedo, getLastAction]);

  if (!pdfDocument || !visible) return null;

  return (
    <div
      className={cn(
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-50',
        'flex items-center gap-2 px-4 py-2.5 rounded-full',
        'bg-elevated border border-border shadow-xl',
        'animate-in slide-in-from-bottom-4 fade-in duration-200'
      )}
    >
      <span className="text-xs text-secondary font-mono truncate max-w-[120px]">
        {lastLabel ?? 'Action'}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => undo()}
          disabled={!canUndo()}
          className={cn(
            'w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium',
            'transition-colors',
            canUndo()
              ? 'bg-accent/20 text-accent hover:bg-accent/30 cursor-pointer'
              : 'text-tertiary cursor-not-allowed'
          )}
          title="Undo (Ctrl+Z)"
        >
          ↩
        </button>
        <button
          onClick={() => redo()}
          disabled={!canRedo()}
          className={cn(
            'w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium',
            'transition-colors',
            canRedo()
              ? 'bg-accent/20 text-accent hover:bg-accent/30 cursor-pointer'
              : 'text-tertiary cursor-not-allowed'
          )}
          title="Redo (Ctrl+Shift+Z)"
        >
          ↪
        </button>
      </div>
    </div>
  );
}