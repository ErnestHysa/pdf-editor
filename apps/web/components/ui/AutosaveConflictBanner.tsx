'use client';

import { useEffect, useState } from 'react';
import { useAutosaveConflict } from '@/hooks/useAutosave';
import { useUIStore } from '@/stores/uiStore';
import { cn } from '@/lib/utils';

export function AutosaveConflictBanner() {
  const { hasConflict, resolveReload, resolveKeep } = useAutosaveConflict();
  const setToast = useUIStore((s) => s.setToast);
  const [visible, setVisible] = useState(false);

  // Show toast-style notification instead of blocking banner
  useEffect(() => {
    if (hasConflict) {
      setVisible(true);
      setToast('Document modified in another tab — click to resolve');
    } else {
      setVisible(false);
    }
  }, [hasConflict, setToast]);

  if (!visible || !hasConflict) return null;

  return (
    <div
      className={cn(
        'fixed top-4 left-1/2 -translate-x-1/2 z-[100]',
        'bg-amber-50 border border-amber-200',
        'px-4 py-3 rounded-lg shadow-xl',
        'flex items-center gap-3 max-w-md',
        'animate-in slide-in-from-top-2 fade-in duration-200'
      )}
      role="alert"
      aria-live="polite"
    >
      <div className="flex-1">
        <p className="text-sm text-amber-800 font-medium">
          Document modified in another tab
        </p>
        <p className="text-xs text-amber-600 mt-0.5">
          What would you like to do?
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => {
            resolveKeep();
            setVisible(false);
          }}
          className="px-3 py-1.5 text-sm font-medium text-amber-700 bg-white border border-amber-200 rounded hover:bg-amber-100 transition-colors"
        >
          Keep mine
        </button>
        <button
          onClick={() => {
            resolveReload();
            setVisible(false);
          }}
          className="px-3 py-1.5 text-sm font-medium text-amber-700 bg-white border border-amber-200 rounded hover:bg-amber-100 transition-colors"
        >
          Load theirs
        </button>
      </div>
    </div>
  );
}