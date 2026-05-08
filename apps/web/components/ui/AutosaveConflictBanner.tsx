'use client';

import { useAutosaveConflict } from '@/hooks/useAutosave';

export function AutosaveConflictBanner() {
  const { hasConflict, resolveReload, resolveKeep } = useAutosaveConflict();

  return (
    <div
      className={`
        fixed top-0 left-0 right-0 z-50
        bg-amber-50 border-b border-amber-200
        px-4 py-3
        flex items-center justify-between gap-4
        shadow-sm
        transition-all duration-300 ease-out
        ${hasConflict
          ? 'translate-y-0 opacity-100'
          : '-translate-y-full opacity-0 pointer-events-none'
        }
      `}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
    >
      <p className="text-sm text-amber-800 font-medium">
        This document was modified in another tab. What would you like to do?
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={resolveKeep}
          className="px-3 py-1.5 text-sm font-medium text-amber-700 bg-white border border-amber-200 rounded hover:bg-amber-100 transition-colors"
        >
          Keep mine
        </button>
        <button
          onClick={resolveReload}
          className="px-3 py-1.5 text-sm font-medium text-amber-700 bg-white border border-amber-200 rounded hover:bg-amber-100 transition-colors"
        >
          Load theirs
        </button>
      </div>
    </div>
  );
}