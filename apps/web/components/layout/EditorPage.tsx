'use client';
import {
  useEffect, useRef, useState, useCallback, useMemo, Suspense,
} from 'react';
import * as pdfjsLib from 'pdfjs-dist/legacy';
import { useDocumentStore } from '@/stores/documentStore';
import { useUIStore } from '@/stores/uiStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useToolStore } from '@/stores/toolStore';
import { useFileHandler } from '@/hooks/useFileHandler';
import { useAutosave } from '@/hooks/useAutosave';
import { AutosaveConflictBanner } from '@/components/ui/AutosaveConflictBanner';
import { PdfParser } from '@/hooks/usePdfParser';
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
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
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
    selectedObjects, clearSelection, setDirty, reloadTrigger,
    setTextObjects, addTextObject, textObjects,
    annotations, addAnnotation, removeAnnotation,
    imageObjects, addImageObject, removeImageObject, updateImageObject,
    isLoading,
  } = useDocumentStore();

  const {
    zoom, setZoom, panOffset, setPanOffset,
    leftSidebarOpen, rightPanelOpen,
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
      parser.parseAllPages().then((pageMap) => {
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

        // Clear any selected objects whose IDs no longer exist in textObjects (#8)
        const validIds = new Set(allObjects.map(o => o.id));
        const state = useDocumentStore.getState();
        const stale = state.selectedObjects.filter((o: SelectedObject) => o.type === 'text' && !validIds.has(o.id));
        if (stale.length > 0) {
          useDocumentStore.getState().clearSelection();
        }
      });
    }).catch((err: unknown) => {
      setPdfError(err instanceof Error ? err.message : 'Failed to load PDF');
    });
  }, [pdfDocument, reloadTrigger]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      if (isMod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (isMod && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); return; }
      if (isMod && e.key === 'y') { e.preventDefault(); redo(); return; }
      if (isMod && e.key === 'd') { e.preventDefault(); useDocumentStore.getState().duplicateSelected(); return; }
      if (isMod && e.key === 'c') { e.preventDefault(); useDocumentStore.getState().copySelected(); return; }
      if (isMod && e.key === 'v') {
        e.preventDefault();
        // Use navigator.clipboard for both images and text (clipboard permission)
        navigator.clipboard.read().then(async (items) => {
          for (const item of items) {
            // Image
            const imageType = item.types.find((t) => t.startsWith('image/'));
            if (imageType) {
              const blob = await item.getType(imageType);
              const dataUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
              const img = new Image();
              img.onload = () => {
                const page = pages[activePageIndex];
                const pageWidth = page?.getWidth?.() ?? 612;
                const pageHeight = page?.getHeight?.() ?? 792;
                addImageObject({
                  id: `img-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  pageIndex: activePageIndex,
                  x: pageWidth / 2 - img.width / 2,
                  y: pageHeight / 2 - img.height / 2,
                  width: img.width,
                  height: img.height,
                  src: dataUrl,
                  rotation: 0,
                  objectRef: '',
                });
              };
              img.src = dataUrl;
              return;
            }
          }
          // Fall back to text
          const text = await navigator.clipboard.readText();
          if (text) {
            const page = pages[activePageIndex];
            const pageWidth = page?.getWidth?.() ?? 612;
            const pageHeight = page?.getHeight?.() ?? 792;
            addTextObject({
              id: `text-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              pageIndex: activePageIndex,
              content: text,
              x: pageWidth / 2,
              y: pageHeight / 2,
              width: 200,
              height: 50,
              fontSize: 16,
              fontFamily: 'sans-serif',
              fontWeight: 'normal',
              fontStyle: 'normal',
              color: '#000000',
              textAlign: 'left',
              rotation: 0,
              objectRef: '',
            });
          }
        }).catch(() => {
          // Fall back to internal clipboard store
          useDocumentStore.getState().pasteClipboard();
        });
        return;
      }

      if (e.key === 'Escape') { clearSelection(); setContextMenu(null); if (showShortcuts) setShowShortcuts(false); return; }
      if (e.key === '?') { e.preventDefault(); setShowShortcuts((v) => !v); return; }
      if (isMod && e.key === 'k') { e.preventDefault(); handleCommandPaletteToggle(); return; }

      // Use getState() to avoid stale closures for selectedObjects and textObjects
      const { selectedObjects: currentSelected, textObjects: currentTextObjects, activePageIndex: currentPageIndex } = useDocumentStore.getState();

      if ((e.key === 'Delete' || e.key === 'Backspace') && currentSelected.length > 0) {
        e.preventDefault();
        handleDeleteSelected();
        return;
      }

      // Tool shortcuts (only when not typing in an input)
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      // Tab navigation between text objects on the active page
      if (e.key === 'Tab' && currentSelected.length > 0) {
        e.preventDefault();
        const currentPageObjs = currentTextObjects
          .filter((o: { pageIndex: number; y: number; x: number; id: string }) => o.pageIndex === currentPageIndex)
          .sort((a: { y: number; x: number }, b: { y: number; x: number }) => a.y - b.y || a.x - b.x);
        const currentId = currentSelected[0]?.id;
        const idx = currentPageObjs.findIndex((o: { id: string }) => o.id === currentId);
        const next = e.shiftKey
          ? currentPageObjs[(idx - 1 + currentPageObjs.length) % currentPageObjs.length]
          : currentPageObjs[(idx + 1) % currentPageObjs.length];
        if (next) {
          useDocumentStore.getState().selectObject({ id: next.id, type: 'text', pageIndex: next.pageIndex });
        }
        return;
      }

      if (isMod) return; // don't override other Cmd/Ctrl combos

      const { setTool } = useToolStore.getState();
      switch (e.key.toUpperCase()) {
        case 'V': setTool('select'); break;
        case 'T': setTool('text'); break;
        case 'R': setTool('rectangle'); break;
        case 'E': setTool('ellipse'); break;
        case 'L': setTool('line'); break;
        case 'A': setTool('arrow'); break;
        case 'H': setTool('highlight'); break;
        case 'U': setTool('underline'); break;
        case 'S': setTool('strikethrough'); break;
        case 'N': setTool('sticky'); break;
        case 'C': setTool('comment'); break;
        case 'D': setTool('draw'); break;
        case 'I': setTool('image'); break;
        case 'G': setTool('signature'); break;
                      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, clearSelection, showShortcuts, handleCommandPaletteToggle]);

  // Shared delete logic used by keyboard and context menu
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
      removed.forEach((obj: any) => useDocumentStore.getState().removeTextObject(obj.id));
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
      toRemoveImgs.forEach((obj: any) => removeImageObject(obj.id));
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
      toRemoveAnns.forEach((obj: any) => removeAnnotation(obj.id));
    }
    clearSelection();
  }, [selectedObjects, textObjects, clearSelection]);

  // ── Paste handler: clipboard image or text → object at active page center ─
  // Uses getState() to avoid stale closure on pages/pdfDocument
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const { pdfDocument: doc, activePageIndex: api, addImageObject: addImg, addTextObject: addTxt } = useDocumentStore.getState();
    const pages = doc ? doc.getPages() : [];
    const page = pages[api];
    if (!page) return;

    const pageWidth = page.getWidth?.() ?? 612;
    const pageHeight = page.getHeight?.() ?? 792;
    const centerX = pageWidth / 2;
    const centerY = pageHeight / 2;

    // Try image first
    const imageItems = e.clipboardData?.items;
    if (imageItems) {
      for (const item of Array.from(imageItems)) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            const dataUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });

            const img = new Image();
            img.onload = () => {
              addImg({
                id: `img-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                pageIndex: api,
                x: centerX - img.width / 2,
                y: centerY - img.height / 2,
                width: img.width,
                height: img.height,
                src: dataUrl,
                rotation: 0,
                opacity: 1,
                objectRef: '',
              });
            };
            img.src = dataUrl;
            return;
          }
        }
      }
    }

    // Try text
    const text = e.clipboardData?.getData('text/plain');
    if (text) {
      addTxt({
        id: `text-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        pageIndex: api,
        content: text,
        x: centerX,
        y: centerY,
        width: 200,
        height: 50,
        fontSize: 16,
        fontFamily: 'sans-serif',
        fontWeight: 'normal',
        fontStyle: 'normal',
        color: '#000000',
        textAlign: 'left',
        rotation: 0,
        objectRef: '',
      });
    }
  }, []);

  // ── Virtualization: only render active page ± buffer pages ─────
  const VIRTUAL_BUFFER = 3;
  const pages = pdfDocument ? pdfDocument.getPages() : [];
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
      <div className="flex flex-col h-screen bg-bg-base">
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
    <div className="flex flex-col h-screen bg-bg-base overflow-hidden">
      {/* Skip to main content — visible to screen readers, hidden visually */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-blue-600 focus:text-white focus:px-4 focus:py-2 focus:rounded">
        Skip to main content
      </a>
      {/* Full-canvas loading overlay */}
      {isLoading && (
        <div className="fixed inset-0 z-50 bg-bg-primary/80 backdrop-blur-sm flex items-center justify-center">
          <Loader2 size={48} className="animate-spin text-text-primary" />
        </div>
      )}
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
      {useUIStore((s) => s.toast) && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-3 bg-red-500 text-white text-sm rounded-lg shadow-lg flex items-center gap-2">
          <span>{useUIStore((s) => s.toast)}</span>
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
              action: () => useDocumentStore.getState().duplicateSelected(),
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