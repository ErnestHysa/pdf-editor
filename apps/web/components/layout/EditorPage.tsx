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
import { PdfParser } from '@/hooks/usePdfParser';
import type { SerializableTextObject } from '@/stores/documentStore';
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
    setTextObjects, textObjects,
    annotations, addAnnotation, removeAnnotation,
    imageObjects, addImageObject, removeImageObject, updateImageObject,
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
  const [isGesturing, setIsGesturing] = useState(false);
    
  const containerRef = useRef<HTMLDivElement>(null);

  // Canvas long-press handler: show context menu at viewport-relative coordinates
  // canvasX/canvasY are in canvas-space (untransformed); convert to viewport-space
  const handleCanvasLongPress = useCallback((canvasX: number, canvasY: number) => {
    // Convert canvas coords → screen coords via the inverse of the canvas transform
    // The container div scrolls independently; use page index to get the page rect
    const pageEl = pageRefs.current[activePageIndex];
    if (!pageEl) return;
    const rect = pageEl.getBoundingClientRect();
    const screenX = canvasX * zoom + rect.left;
    const screenY = canvasY * zoom + rect.top;
    setContextMenu({ x: screenX, y: screenY });
  }, [zoom, activePageIndex]);

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
      if (isMod && e.key === 'v') { e.preventDefault(); useDocumentStore.getState().pasteClipboard(); return; }

      if (e.key === 'Escape') { clearSelection(); setContextMenu(null); return; }
      if (e.key === '?') { e.preventDefault(); setShowShortcuts((v) => !v); return; }
      if (isMod && e.key === 'k') { e.preventDefault(); useUIStore.getState().setCommandPaletteOpen(true); return; }

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
          .filter((o) => o.pageIndex === currentPageIndex)
          .sort((a, b) => a.y - b.y || a.x - b.x);
        const currentId = currentSelected[0]?.id;
        const idx = currentPageObjs.findIndex((o) => o.id === currentId);
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
                      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, clearSelection]);

  // Shared delete logic used by keyboard and context menu
  const handleDeleteSelected = useCallback(() => {
    // Text
    const toRemoveText = selectedObjects
      .filter((obj) => obj.type === 'text')
      .map((obj) => textObjects.find((t) => t.id === obj.id))
      .filter(Boolean) as SerializableTextObject[];
    if (toRemoveText.length > 0) {
      const removed = [...toRemoveText];
      useHistoryStore.getState().push({
        label: 'Delete text', description: 'Delete text',
        targetIds: removed.map((obj) => obj.id),
        undo: () => removed.forEach((obj) => useDocumentStore.getState().addTextObject(obj)),
        redo: () => removed.forEach((obj) => useDocumentStore.getState().removeTextObject(obj.id)),
      });
      removed.forEach((obj) => useDocumentStore.getState().removeTextObject(obj.id));
    }
    // Images (Zustand)
    const toRemoveImgs = selectedObjects.filter((obj) => obj.type === 'image');
    if (toRemoveImgs.length > 0) {
      const removedImgs = [...toRemoveImgs];
      useHistoryStore.getState().push({
        label: 'Delete image', description: 'Delete image',
        targetIds: removedImgs.map((obj) => obj.id),
        undo: () => removedImgs.forEach((obj) => {
          const img = useDocumentStore.getState().imageObjects.find((i) => i.id === obj.id);
          if (img) addImageObject(img);
        }),
        redo: () => toRemoveImgs.forEach((obj) => removeImageObject(obj.id)),
      });
      toRemoveImgs.forEach((obj) => removeImageObject(obj.id));
    }
    // Annotations
    const toRemoveAnns = selectedObjects.filter((obj) => obj.type === 'annotation');
    if (toRemoveAnns.length > 0) {
      const removedAnns = [...toRemoveAnns];
      useHistoryStore.getState().push({
        label: 'Delete annotation', description: 'Delete annotation',
        targetIds: removedAnns.map((obj) => obj.id),
        undo: () => removedAnns.forEach((obj) => {
          const ann = useDocumentStore.getState().annotations.find((a) => a.id === obj.id);
          if (ann) addAnnotation(ann);
        }),
        redo: () => toRemoveAnns.forEach((obj) => removeAnnotation(obj.id)),
      });
      toRemoveAnns.forEach((obj) => removeAnnotation(obj.id));
    }
    clearSelection();
  }, [selectedObjects, textObjects, clearSelection]);

  // ── Virtualization: only render active page ± 2 buffer pages ─────
  const VIRTUAL_BUFFER = 2;
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
      <TopBar />
      {pdfDocument && <FontWarningBanner />}
      <div className="flex flex-1 overflow-hidden">
        {deviceType !== 'mobile' && <LeftSidebar open={leftSidebarOpen} />}

        {/* Canvas area */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto bg-bg-base relative"
          style={{ touchAction: 'none' }}
          role="application"
          aria-label="PDF canvas editing area"
          aria-describedby="canvas-instructions"
          tabIndex={0}
          onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }); }}
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
            {pages.map((page, i) => (
              <ErrorBoundary key={i} pageIndex={i}>
                <div
                  ref={(el) => { pageRefs.current[i] = el; }}
                >
                  <PageCanvas
                    page={page}
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

      {/* Global UI overlays */}
      <UndoRedoPill />
      <CommandPalette />
      {showShortcuts && (
        <KeyboardShortcutsOverlay onClose={() => setShowShortcuts(false)} />
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