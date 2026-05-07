"use client";
import { useState } from 'react';
import { cn } from '@/lib/utils';

const shortcuts = [
  { keys: ['V'], label: 'Select tool' },
  { keys: ['T'], label: 'Text tool' },
  { keys: ['R'], label: 'Rectangle tool' },
  { keys: ['E'], label: 'Ellipse tool' },
  { keys: ['L'], label: 'Line tool' },
  { keys: ['A'], label: 'Arrow tool' },
  { keys: ['H'], label: 'Highlight tool' },
  { keys: ['U'], label: 'Underline tool' },
  { keys: ['S'], label: 'Strikethrough tool' },
  { keys: ['N'], label: 'Sticky note tool' },
  { keys: ['C'], label: 'Comment tool' },
  { keys: ['D'], label: 'Draw tool' },
  { keys: ['I'], label: 'Image tool' },
  { keys: ['⌘', 'K'], label: 'Command palette' },
  { keys: ['⌘', 'Z'], label: 'Undo' },
  { keys: ['⌘', '⇧', 'Z'], label: 'Redo' },
  { keys: ['⌘', 'Y'], label: 'Redo' },
  { keys: ['⌘', 'D'], label: 'Duplicate' },
  { keys: ['⌘', 'C'], label: 'Copy' },
  { keys: ['⌘', 'V'], label: 'Paste' },
  { keys: ['Delete'], label: 'Delete selected' },
  { keys: ['Backspace'], label: 'Delete selected' },
  { keys: ['Tab'], label: 'Next object' },
  { keys: ['⇧', 'Tab'], label: 'Previous object' },
  { keys: ['Esc'], label: 'Clear selection / close' },
  { keys: ['?'], label: 'Show shortcuts' },
];

export function KeyboardShortcutsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-xl border border-border shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-surface px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-semibold text-primary">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="text-xs text-secondary hover:text-primary px-2 py-1 rounded bg-hover"
          >
            ✕ Close
          </button>
        </div>
        <div className="p-6 grid grid-cols-2 gap-4">
          {shortcuts.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-1.5">
              <span className="text-sm text-secondary">{s.label}</span>
              <div className="flex gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="px-2 py-1 text-xs font-mono rounded border border-border bg-elevated text-primary min-w-[24px] text-center"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}