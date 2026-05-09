"use client";
import { useState } from 'react';
import { cn } from '@/lib/utils';

const shortcuts = [
  // ── Tools ──────────────────────────────────────────────────────────
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
  { keys: ['G'], label: 'Signature tool' },
  // ── Actions ────────────────────────────────────────────────────────
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
  // ── Navigation ────────────────────────────────────────────────────
  { keys: ['←'], label: 'Previous page' },
  { keys: ['→'], label: 'Next page' },
  { keys: ['1'], label: 'Go to page 1' },
  { keys: ['2'], label: 'Go to page 2' },
  { keys: ['3'], label: 'Go to page 3' },
  { keys: ['4'], label: 'Go to page 4' },
  { keys: ['5'], label: 'Go to page 5' },
  { keys: ['6'], label: 'Go to page 6' },
  { keys: ['7'], label: 'Go to page 7' },
  { keys: ['8'], label: 'Go to page 8' },
  { keys: ['9'], label: 'Go to page 9' },
  // ── View ─────────────────────────────────────────────────────────
  { keys: ['⌘', '+'], label: 'Zoom in' },
  { keys: ['⌘', '-'], label: 'Zoom out' },
  { keys: ['⌘', '0'], label: 'Zoom to fit' },
  { keys: ['⌘', '1'], label: 'Zoom to 100%' },
  { keys: ['['], label: 'Rotate page left' },
  { keys: [']'], label: 'Rotate page right' },
  // ── Panels ───────────────────────────────────────────────────────
  { keys: ['⌘', 'B'], label: 'Toggle left sidebar' },
  { keys: ['⌘', 'J'], label: 'Toggle right sidebar' },
  // ── File ─────────────────────────────────────────────────────────
  { keys: ['⌘', 'S'], label: 'Save / Export PDF' },
  { keys: ['⌘', 'P'], label: 'Print' },
];

const mobileShortcuts = [
  { keys: ['Tap'], label: 'Select object / tool' },
  { keys: ['Long press'], label: 'Context menu' },
  { keys: ['Pinch'], label: 'Zoom in / out' },
  { keys: ['Two-finger tap'], label: 'Pan mode' },
  { keys: ['Double tap'], label: 'Fit page to screen' },
];

type Section = { title: string; items: typeof shortcuts };

const sections: Section[] = [
  { title: 'Tools', items: shortcuts.filter(s => ['Select tool','Text tool','Rectangle tool','Ellipse tool','Line tool','Arrow tool','Highlight tool','Underline tool','Strikethrough tool','Sticky note tool','Comment tool','Draw tool','Image tool','Signature tool'].includes(s.label)) },
  { title: 'Actions', items: shortcuts.filter(s => ['Command palette','Undo','Redo','Duplicate','Copy','Paste','Delete selected','Next object','Previous object','Clear selection / close','Show shortcuts'].includes(s.label)) },
  { title: 'Navigation', items: shortcuts.filter(s => ['Previous page','Next page','Go to page 1','Go to page 2','Go to page 3','Go to page 4','Go to page 5','Go to page 6','Go to page 7','Go to page 8','Go to page 9'].includes(s.label)) },
  { title: 'View', items: shortcuts.filter(s => ['Zoom in','Zoom out','Zoom to fit','Zoom to 100%','Rotate page left','Rotate page right'].includes(s.label)) },
  { title: 'Panels', items: shortcuts.filter(s => ['Toggle left sidebar','Toggle right sidebar'].includes(s.label)) },
  { title: 'File', items: shortcuts.filter(s => ['Save / Export PDF','Print'].includes(s.label)) },
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
        <div className="p-6 space-y-6">
          {sections.map((section) => (
            <div key={section.title}>
              <h3 className="text-xs font-semibold text-secondary uppercase tracking-wider mb-3">{section.title}</h3>
              <div className="grid grid-cols-2 gap-2">
                {section.items.map((s, i) => (
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
          ))}

          {/* Mobile shortcuts */}
          <div>
            <h3 className="text-xs font-semibold text-secondary uppercase tracking-wider mb-3">Mobile</h3>
            <div className="grid grid-cols-2 gap-2">
              {mobileShortcuts.map((s, i) => (
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
      </div>
    </div>
  );
}