'use client';
import {
  useEffect, useRef, useState, useCallback, useMemo,
} from 'react';
import * as pdfjsLib from 'pdfjs-dist/legacy';
import { useDocumentStore } from '@/stores/documentStore';
import { useObjectsStore } from '@/stores/objectsStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useSearchStore } from '@/stores/searchStore';
import { useUIStore } from '@/stores/uiStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useToolStore } from '@/stores/toolStore';
import { useFileHandler } from '@/hooks/useFileHandler';
import { useAutosave } from '@/hooks/useAutosave';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { usePasteHandler } from '@/hooks/usePasteHandler';
import { AutosaveConflictBanner } from '@/components/ui/AutosaveConflictBanner';
import { ParsingOverlay } from '@/components/ui/ParsingOverlay';
import { PdfParser } from '@pagecraft/pdf-engine';
import type { SerializableTextObject, SelectedObject } from '@/stores/documentStore';
import { EmptyState } from '@/components/layout/EmptyState';
import { TopBar } from '@/components/layout/TopBar';
import { LeftSidebar } from '@/components/layout/LeftSidebar';
import { RightPanel } from '@/components/panels/RightPanel';
import { ZoomControl } from '@/components/canvas/ZoomControl';
import { MobileBottomSheet } from '@/components/mobile/MobileBottomSheet';
import { ToolFAB } from '@/components/mobile/ToolFAB';
import { UndoRedoPill } from '@/components/ui/UndoRedoPill';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { KeyboardShortcutsOverlay } from '@/components/ui/KeyboardShortcutsOverlay';
import { ContextMenu } from '@/components/canvas/ContextMenu';
import { PageCanvas } from '@/components/canvas/PageCanvas';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { FontWarningBanner } from '@/components/ui/FontWarningBanner';
import { useDeviceType } from '@/hooks/useDeviceType';
import { useGestures } from '@/hooks/useGestures';

// ── EditorPage ────────────────────────────────────────────────────
// The top-level editor shell. Handles:
//   - PDF load/unload (via pdf.js ↔ Zustand)
//   - Global keyboard shortcuts
//   - Layout (TopBar + sidebar + canvas + right panel)
//   - Global overlays (command palette, undo pill, shortcuts, context menu)
//   - Touch gestures (pinch-to-zoom, long-press, double-tap) via useGestures hook
// All rendering logic has been moved to PageCanvas.tsx

export function EditorPage() {
  const {
    pdfDocument, setDocument, pdfJsDoc, setPdfJsDoc,
    activePageIndex, setActivePage,
    setDirty, reloadTrigger,
    isLoading,
    parsingProgress, setParsingProgress,
  } = useDocumentStore();

  // Objects
  const textObjects = useObjectsStore((s) => s.textObjects);
  const setTextObjects = useObjectsStore((s) => s.setTextObjects);
  const addTextObject = useObjectsStore((s) => s.addTextObject);
  const removeTextObject = useObjectsStore((s) => s.removeTextObject);
  const annotations = useObjectsStore((s) => s.annotations);
  const addAnnotation = useObjectsStore((s) => s.addAnnotation);
  const removeAnnotation = useObjectsStore((s) => s.removeAnnotation);
  const updateAnnotation = useObjectsStore((s) => s.updateAnnotation);
  const imageObjects = useObjectsStore((s) => s.imageObjects);
  const addImageObject = useObjectsStore((s) => s.addImageObject);
  const removeImageObject = useObjectsStore((s) => s.removeImageObject);
  const updateImageObject = useObjectsStore((s) => s.updateImageObject);
  const copySelected = useObjectsStore((s) => s.copySelected);
  const pasteClipboard = useObjectsStore((s) => s.pasteClipboard);
  const duplicateSelected = useObjectsStore((s) => s.duplicateSelected);

  // Selection
  const selectedObjects = useSelectionStore((s) => s.selectedObjects);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const selectObject = useSelectionStore((s) => s.selectObject);

  // Search
  const searchActiveMatches = useSearchStore((s) => s.searchActiveMatches);
  const setSearchActiveMatches = useSearchStore((s) => s.setSearchActiveMatches);
  const clearSearch = useSearchStore((s) => s.clearSearch);

  const {
    zoom, setZoom, panOffset, setPanOffset,
    leftSidebarOpen, rightPanelOpen,
    toast,
  } = useUIStore();

  const { undo, redo } = useHistoryStore();
  const { activeTool } = useToolStore();
  const deviceType = useDeviceType();
  const { handleFile } = useFileHandler();
  const [hasFile, setHasFile] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [isGesturing, setIsGesturing] = useState(false);

  const handleCommandPaletteToggle = useCallback(() => {
    setCommandPaletteOpen((v) => !v);
  }, []);
  
  const containerRef = useRef<HTMLDivElement>(null);

  // Check for ?pdf= URL param on mount to auto-load a PDF file
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pdfParam = params.get('pdf');
    if (pdfParam && !pdfDocument && !hasFile) {
      import('@/hooks/useFileHandler').then(({ __loadPdfFromUrl }) => {
        __loadPdfFromUrl(`/${pdfParam}`).catch(console.error);
      });
    }
  }, []);

  // Canvas long-press handler: show context menu at viewport-relative coordinates
  // canvasX/canvasY are in canvas-space (untransformed); convert to viewport-space
  const handleCanvasLongPress = useCallback((canvasX: number, canvasY: number) => {
    // Don't fire if user is currently editing text (mid text-tool edit session)
    const currentTool = useToolStore.getState().activeTool;
    if (currentTool === 'text') return;

    // Convert canvas coords → screen coords via the inverse of the canvas transform
    // The container div scrolls independently; use page index to get the page rect
    const pageEl = pageRefs.current[activePageIndex];
    if (!pageEl) return;
    const rect = pageEl.getBoundingClientRect();
    // Account for zoom, pan offset, and page position in screen coords
    const screenX = canvasX * zoom + rect.left + panOffset.x;
    const screenY = canvasY * zoom + rect.top + panOffset.y;
    setContextMenu({ x: screenX, y: screenY });
  }, [zoom, activePageIndex, panOffset]);

  // Stable handlers object to avoid effect re-runs on every render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const gestureHandlers = useMemo(() => ({
    onLongPress: handleCanvasLongPress,
    onGestureStart: () => setIsGesturing(true),
    onGestureEnd: () => setIsGesturing(false),
  }), [handleCanvasLongPress]);

  // Consolidate gesture handling via useGestures hook
  // Handles: pinch-to-zoom (via internal setZoom), long-press (context menu), double-tap, gesture guard
  useGestures(containerRef, gestureHandlers);

  // Autosave to IndexedDB whenever document is dirty
  useAutosave();

  // Pages array for keyboard shortcuts hook
  const allPages = useMemo(() => pdfDocument ? pdfDocument.getPages() : [], [pdfDocument]);

  // Delete handler (defined before useKeyboardShortcuts to avoid TDZ)
  const handleDeleteSelected = useCallback(() => {
    // Text
    const toRemoveText = selectedObjects
      .filter((obj: any) => obj.type === 'text')
      .map((obj: any) => textObjects.find((t: any) => t.id === obj.id))
      .filter(Boolean) as SerializableTextObject[];
    if (toRemoveText.length > 0) {
      const removed = [...toRemoveText];
      useHistoryStore.getState().push({
        label: 'Delete text',
        targetIds: removed.map((obj: any) => obj.id),
        type: 'text-delete',
        objectData: removed,
      });
      removed.forEach((obj: any) => removeTextObject(obj.id));
    }
    // Images (Zustand)
    const toRemoveImgs = selectedObjects.filter((obj: any) => obj.type === 'image');
    if (toRemoveImgs.length > 0) {
      const removedImgs = [...toRemoveImgs];
      useHistoryStore.getState().push({
        label: 'Delete image',
        targetIds: removedImgs.map((obj: any) => obj.id),
        type: 'image-delete',
        objectData: removedImgs,
      });
      removedImgs.forEach((obj: any) => removeImageObject(obj.id));
    }
    // Annotations
    const toRemoveAnns = selectedObjects.filter((obj: any) => obj.type === 'annotation');
    if (toRemoveAnns.length > 0) {
      const removedAnns = [...toRemoveAnns];
      useHistoryStore.getState().push({
        label: 'Delete annotation',
        targetIds: removedAnns.map((obj: any) => obj.id),
        type: 'annotation-delete',
        objectData: removedAnns,
      });
      removedAnns.forEach((obj: any) => removeAnnotation(obj.id));
    }
    clearSelection();
  }, [selectedObjects, textObjects, removeTextObject, removeImageObject, removeAnnotation, clearSelection]);

  // Global keyboard shortcuts (extracted to hook)
  useKeyboardShortcuts({
    handleDeleteSelected,
    handleCommandPaletteToggle,
    showShortcuts,
    setShowShortcuts,
    setContextMenu,
    activePageIndex,
    pages: allPages,
  });

  // Paste handler (extracted to hook)
  const handlePaste = usePasteHandler();

  // Page element refs for scroll-into-view navigation
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  // When activePageIndex changes, scroll that page into view
  useEffect(() => {
    const el = pageRefs.current[activePageIndex];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [activePageIndex]);

  // When document is set OR reloadTrigger fires, reload pdf.js
  useEffect(() => {
    if (!pdfDocument) { setHasFile(false); return; }
    const libDoc = pdfDocument.getLibDoc();
    libDoc.save().then((bytes: Uint8Array) => {
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      return pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    }).then((pdfDoc: pdfjsLib.PDFDocumentProxy) => {
      setPdfJsDoc(pdfDoc);
      setHasFile(true);
      const parser = new PdfParser(pdfDoc);
      parser.parseAllPages((current, total) => {
        setParsingProgress(Math.round((current / total) * 100));
      }).then((pageMap) => {
        const allObjects: SerializableTextObject[] = [];
        pageMap.forEach((objs, pageIndex) => {
          for (const obj of objs) {
            allObjects.push({
              id: `text-${pageIndex}-${obj.objectRef || Math.random().toString(36).slice(2)}`,
              content: obj.content,
              pageIndex,
              x: obj.bbox.x, y: obj.bbox.y,
              width: obj.bbox.width, height: obj.bbox.height,
              fontSize: obj.style.fontSize,
              fontFamily: obj.style.fontFamily,
              fontWeight: obj.style.fontWeight,
              fontStyle: obj.style.fontStyle,
              color: obj.style.color,
              textAlign: obj.style.textAlign,
              rotation: obj.rotation ?? 0,
              objectRef: obj.objectRef,
            });
          }
        });
        setTextObjects(allObjects);
        setParsingProgress(100);

        // Clear any selected objects whose IDs no longer exist in textObjects (#8)
        const validIds = new Set(allObjects.map(o => o.id));
        const stale = selectedObjects.filter((o: SelectedObject) => o.type === 'text' && !validIds.has(o.id));
        if (stale.length > 0) {
          clearSelection();
        }
      });
    }).catch((err: unknown) => {
      setPdfError(err instanceof Error ? err.message : 'Failed to load PDF');
      setParsingProgress(0);
    });
  }, [pdfDocument, reloadTrigger, setPdfJsDoc, setTextObjects, selectedObjects, clearSelection, setParsingProgress]);

  // ── Virtualization: only render active page ± buffer pages ─────
  const VIRTUAL_BUFFER = 3;
  const pages = useMemo(() => pdfDocument ? pdfDocument.getPages() : [], [pdfDocument]);
  const totalPages = pages.length;
  const virtualIndexes = Array.from(
    { length: totalPages },
    (_, i) => i
  ).filter((i) =>
    i >= activePageIndex - VIRTUAL_BUFFER &&
    i <= activePageIndex + VIRTUAL_BUFFER
  );

  if (!pdfDocument) {
    return (
      <div
        className="flex flex-col h-screen bg-bg-base"
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const file = e.dataTransfer.files[0];
          if (file && file.type === 'application/pdf') {
            handleFile(file).catch((err) => setPdfError(err instanceof Error ? err.message : 'Failed to open file'));
          }
        }}
      >
        <TopBar />
        <main className="flex-1 overflow-hidden">
          <EmptyState
            onFile={async (file) => {
              try { await handleFile(file); }
              catch (err) { setPdfError(err instanceof Error ? err.message : 'Failed to open file'); }
            }}
          />
        </main>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-screen bg-bg-base overflow-hidden"
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'application/pdf') {
          handleFile(file).catch((err) => setPdfError(err instanceof Error ? err.message : 'Failed to open file'));
        }
      }}
    >
      {/* Skip to main content — visible to screen readers, hidden visually */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-blue-600 focus:text-white focus:px-4 focus:py-2 focus:rounded">
        Skip to main content
      </a>
      {/* Full-canvas loading / parsing progress overlay */}
      <ParsingOverlay
        isLoading={isLoading}
        parsingProgress={parsingProgress}
        pdfJsDoc={pdfJsDoc}
      />
      <AutosaveConflictBanner />
      <TopBar />
      {pdfDocument && <FontWarningBanner />}
      <div className="flex flex-1 overflow-hidden">
        {deviceType !== 'mobile' && <LeftSidebar open={leftSidebarOpen} />}

        {/* Canvas area */}
        <div
          ref={containerRef}
          id="main-content"
          className="flex-1 overflow-auto bg-bg-base relative"
          style={{ touchAction: 'none' }}
          role="application"
          aria-label="PDF canvas editing area"
          aria-describedby="canvas-instructions"
          tabIndex={0}
          onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }); }}
          onPaste={handlePaste}
          onClick={(e) => {
            if ((e.target as HTMLElement).classList.contains('canvas-scroll-root')) {
              clearSelection();
            }
          }}
        >
          {/* Screen reader instructions */}
          <div id="canvas-instructions" className="sr-only">
            Use arrow keys to navigate pages. Press 1-9 to jump to page. Press Delete to remove selected objects.
          </div>
          {/* Pages wrapper with zoom/pan transform */}
          <div
            className="canvas-scroll-root pt-8 pb-24 px-8"
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
              transformOrigin: 'top center',
            }}
          >
            {virtualIndexes.map((i) => (
              <ErrorBoundary key={i} pageIndex={i}>
                <div
                  ref={(el) => { pageRefs.current[i] = el; }}
                >
                  <PageCanvas
                    page={pages[i]}
                    pageIndex={i}
                    isActive={i === activePageIndex}
                    onPageClick={() => setActivePage(i)}
                    zoom={zoom}
                    isGesturing={isGesturing}
                    onLongPress={handleCanvasLongPress}
                  />
                </div>
              </ErrorBoundary>
            ))}
          </div>

          {totalPages > 0 && <ZoomControl />}
        </div>

        {deviceType !== 'mobile' && <RightPanel open={rightPanelOpen} />}
      </div>

      {/* PDF load error banner */}
      {pdfError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-3 bg-red-500 text-white text-sm rounded-lg shadow-lg flex items-center gap-3">
          <span>{pdfError}</span>
          <button
            onClick={() => setPdfError(null)}
            className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-xs font-medium transition-colors"
          >
            Retry
          </button>
          <button
            onClick={() => setPdfError(null)}
            className="ml-1 hover:opacity-80"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {/* Global UI overlays */}
      <UndoRedoPill />
      <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
      {showShortcuts && (
        <KeyboardShortcutsOverlay onClose={() => setShowShortcuts(false)} />
      )}

      {/* Toast notifications */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-3 bg-red-500 text-white text-sm rounded-lg shadow-lg flex items-center gap-2">
          <span>{toast}</span>
          <button
            onClick={() => useUIStore.getState().setToast(null)}
            className="ml-2 hover:opacity-80"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {deviceType === 'mobile' && (
        <>
          <ToolFAB />
          <MobileBottomSheet />
        </>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            {
              label: 'Edit',
              action: () => {
                if (selectedObjects.length === 1) {
                  const id = selectedObjects[0].id;
                  window.dispatchEvent(new CustomEvent('edit-text-object', { detail: { id } }));
                }
              },
              disabled: selectedObjects.length !== 1,
            },
            {
              label: 'Duplicate',
              action: () => duplicateSelected(),
              disabled: selectedObjects.length === 0,
            },
            { label: '', action: () => {}, divider: true },
            {
              label: 'Delete',
              action: () => handleDeleteSelected(),
              disabled: selectedObjects.length === 0,
            },
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}