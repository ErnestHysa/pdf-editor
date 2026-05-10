'use client';
import { useEffect, useRef, useState, useMemo } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useToolStore } from '@/stores/toolStore';
import { PageThumbnails } from '@/components/canvas/PageThumbnails';
import { ToolFAB } from './ToolFAB';
import { TOOLS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { X, ChevronUp } from 'lucide-react';

export function MobileBottomSheet() {
  const {
    mobileBottomSheetOpen, mobileBottomSheetMode, setMobileBottomSheet,
    activePanel
  } = useUIStore();
  const { pdfDocument } = useDocumentStore();
  const { toolOptions, setToolOption } = useToolStore();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const [sheetMaxHeight, setSheetMaxHeight] = useState(280);
  const sheetHeight = mobileBottomSheetOpen ? sheetMaxHeight : 80;

  // Adjust sheet height when keyboard appears via visualViewport API (mobile)
  useEffect(() => {
    if (!window.visualViewport) return;
    const listener = () => {
      const vp = window.visualViewport!;
      const keyboardHeight = window.innerHeight - vp.height;
      setSheetMaxHeight(keyboardHeight > 100 ? keyboardHeight + 80 : 280);
    };
    window.visualViewport!.addEventListener('resize', listener);
    return () => window.visualViewport!.removeEventListener('resize', listener);
  }, []);

  const pages = useMemo(() => pdfDocument?.getPages() ?? [], [pdfDocument]);

  return (
    <>
      {/* Backdrop */}
      {mobileBottomSheetOpen && (
        <div
          className="bottom-sheet-backdrop"
          onClick={() => setMobileBottomSheet(false)}
        />
      )}

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="fixed bottom-0 left-0 right-0 z-50 bg-bg-surface border-t border-border rounded-t-2xl transition-transform duration-300"
        style={{
          height: sheetHeight,
          transform: `translateY(${dragY}px)`,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Drag handle — 64×8px minimum touch target per iOS HIG (#15) */}
        <div className="flex justify-center py-2">
          <button
            onClick={() => setMobileBottomSheet(!mobileBottomSheetOpen)}
            className="w-16 h-2 rounded-full bg-border-strong"
            style={{ minHeight: '8px' }}
            aria-label="Toggle bottom sheet"
          />
        </div>

        {/* Tool FAB (always visible on mobile) */}
        <ToolFAB />

        {/* Sheet content */}
        {mobileBottomSheetOpen && (
          <div className="px-4 pb-4 overflow-y-auto" style={{ height: 'calc(100% - 80px)' }}>
            {mobileBottomSheetMode === 'pages' && (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {pages.map((page: any, i: number) => (
                  <button
                    key={i}
                    className="shrink-0 rounded border border-border overflow-hidden hover:border-accent transition-colors"
                    style={{ width: 60, aspectRatio: `${page.getWidth()}/${page.getHeight()}` }}
                    onClick={() => {
                      useDocumentStore.getState().setActivePage(i);
                    }}
                  >
                    <div className="w-full h-full bg-white" />
                    <span className="block text-center text-2xs font-mono text-text-tertiary py-0.5">
                      {i + 1}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {mobileBottomSheetMode === 'tool-options' && (
              <div className="space-y-4">
                {/* Color */}
                <div>
                  <label className="text-xs text-text-secondary block mb-2">
                    Color
                  </label>
                  <div className="flex gap-2">
                    {['#C97B3E', '#E05252', '#4CAF7D', '#56C2FF', '#FFC531', '#9B59B6'].map((c) => (
                      <button
                        key={c}
                        onClick={() => setToolOption('color', c)}
                        className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110"
                        style={{
                          backgroundColor: c,
                          borderColor: toolOptions.color === c ? 'white' : 'transparent',
                        }}
                        aria-label={`Select color ${c}`}
                      />
                    ))}
                  </div>
                </div>
                {/* Font Size */}
                <div>
                  <label className="text-xs text-text-secondary block mb-2">Font Size</label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setToolOption('fontSize', Math.max(8, (toolOptions.fontSize ?? 14) - 2))}
                      className="w-8 h-8 rounded border border-border flex items-center justify-center text-sm"
                      aria-label="Decrease font size"
                    >
                      −
                    </button>
                    <span className="text-sm font-mono w-8 text-center">{toolOptions.fontSize ?? 14}px</span>
                    <button
                      onClick={() => setToolOption('fontSize', Math.min(72, (toolOptions.fontSize ?? 14) + 2))}
                      className="w-8 h-8 rounded border border-border flex items-center justify-center text-sm"
                      aria-label="Increase font size"
                    >
                      +
                    </button>
                  </div>
                </div>
                {/* Bold / Italic */}
                <div>
                  <label className="text-xs text-text-secondary block mb-2">Style</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const current = toolOptions.fontWeight === 'bold';
                        setToolOption('fontWeight', current ? 'normal' : 'bold');
                      }}
                      className={`w-9 h-9 rounded border flex items-center justify-center font-bold ${toolOptions.fontWeight === 'bold' ? 'bg-accent text-white' : 'border-border'}`}
                      aria-label={toolOptions.fontWeight === 'bold' ? 'Remove bold' : 'Apply bold'}
                    >
                      B
                    </button>
                    <button
                      onClick={() => {
                        const current = toolOptions.fontStyle === 'italic';
                        setToolOption('fontStyle', current ? 'normal' : 'italic');
                      }}
                      className={`w-9 h-9 rounded border flex items-center justify-center italic ${toolOptions.fontStyle === 'italic' ? 'bg-accent text-white' : 'border-border'}`}
                      aria-label={toolOptions.fontStyle === 'italic' ? 'Remove italic' : 'Apply italic'}
                    >
                      I
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}


