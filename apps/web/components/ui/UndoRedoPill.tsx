"use client";
import { useEffect, useState } from 'react';
import { useHistoryStore } from '@/stores/historyStore';
import { useDocumentStore } from '@/stores/documentStore';
import { cn } from '@/lib/utils';

export function UndoRedoPill() {
  const { undo, redo, canUndo, canRedo, getLastAction, skippedReason, clearSkippedReason } = useHistoryStore();
  const { pdfDocument } = useDocumentStore();
  const [visible, setVisible] = useState(false);
  const [lastLabel, setLastLabel] = useState<string | null>(null);
  const [showSkipFeedback, setShowSkipFeedback] = useState(false);
  const [skipMessage, setSkipMessage] = useState<string | null>(null);

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

  // Handle skip feedback — show toast when skip occurs, auto-clear after 3s
  useEffect(() => {
    if (!skippedReason) return;

    setSkipMessage(skippedReason);
    setShowSkipFeedback(true);
    clearSkippedReason();

    const timer = setTimeout(() => {
      setShowSkipFeedback(false);
      setSkipMessage(null);
    }, 3000);

    return () => clearTimeout(timer);
  }, [skippedReason, clearSkippedReason]);

  if (!pdfDocument) return null;

  return (
    <>
      {/* Skip feedback toast */}
      {showSkipFeedback && skipMessage && (
        <div
          className={cn(
            'fixed bottom-20 left-1/2 -translate-x-1/2 z-[60]',
            'px-4 py-2 rounded-lg',
            'bg-destructive/90 text-destructive-foreground text-sm font-medium',
            'animate-in slide-in-from-bottom-2 fade-in duration-200'
          )}
          style={{
            animation: 'slideUpFade 2s ease-out forwards',
          }}
        >
          {skipMessage}
          <style jsx>{`
            @keyframes slideUpFade {
              0% { opacity: 1; transform: translateX(-50%) translateY(0); }
              70% { opacity: 1; }
              100% { opacity: 0; transform: translateX(-50%) translateY(-8px); }
            }
          `}</style>
        </div>
      )}

      {/* Main pill */}
      {visible && (
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
      )}
    </>
  );
}