'use client';
import { useEffect, useRef } from 'react';
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
  const sheetHeight = mobileBottomSheetOpen ? 280 : 80;

  const pages = pdfDocument?.getPages() ?? [];

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
        {/* Drag handle */}
        <div className="flex justify-center py-2">
          <button
            onClick={() => setMobileBottomSheet(!mobileBottomSheetOpen)}
            className="w-10 h-1 rounded-full bg-border-strong"
          />
        </div>

        {/* Tool FAB (always visible on mobile) */}
        <ToolFAB />

        {/* Sheet content */}
        {mobileBottomSheetOpen && (
          <div className="px-4 pb-4 overflow-y-auto" style={{ height: 'calc(100% - 80px)' }}>
            {mobileBottomSheetMode === 'pages' && (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {pages.map((page, i) => (
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
                      />
                    ))}
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

// We need useState imported
import { useState } from 'react';
