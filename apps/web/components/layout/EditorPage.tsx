"use client";
import {
  useEffect, useRef, useCallback, useState, useMemo,
} from "react";
import * as pdfjsLib from 'pdfjs-dist/legacy';
import { useDocumentStore } from "@/stores/documentStore";
import { useUIStore } from "@/stores/uiStore";
import { useToolStore } from "@/stores/toolStore";
import { useHistoryStore } from "@/stores/historyStore";
import { useFileHandler } from "@/hooks/useFileHandler";
import { useAutosave } from "@/hooks/useAutosave";
import { PdfParser } from "@/hooks/usePdfParser";
import type { SerializableTextObject } from "@/stores/documentStore";
import { EmptyState } from "@/components/layout/EmptyState";
import { TopBar } from "@/components/layout/TopBar";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { RightPanel } from "@/components/panels/RightPanel";
import { ZoomControl } from "@/components/canvas/ZoomControl";
import { MobileBottomSheet } from "@/components/mobile/MobileBottomSheet";
import { ToolFAB } from "@/components/mobile/ToolFAB";
import { TextEditOverlay } from "@/components/canvas/TextEditOverlay";
import { SelectionHandles } from "@/components/canvas/SelectionHandles";
import { cn } from "@/lib/utils";
import { useDeviceType } from "@/hooks/useDeviceType";
import { Page, AnnotationObject } from '@pagecraft/pdf-engine';

// No singleton — pdf.js doc lives in Zustand (documentStore).
// Do NOT use module-level state for cross-component reactivity.

// ── EditorPage ────────────────────────────────────────────────
export function EditorPage() {
  const {
    pdfDocument, setDocument, pdfJsDoc, setPdfJsDoc, activePageIndex, setActivePage,
    selectedObjects, selectObject, clearSelection, setDirty, reloadTrigger,
    setTextObjects, removeTextObject, updateTextObject, addTextObject, textObjects,
  } = useDocumentStore();
  const { zoom, panOffset, setPanOffset, leftSidebarOpen, rightPanelOpen } = useUIStore();
  const { undo, redo, canUndo, canRedo, push } = useHistoryStore();
  const { activeTool } = useToolStore();
  const deviceType = useDeviceType();
  const { handleFile } = useFileHandler();
  const [hasFile, setHasFile] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

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

    // pdf-lib save to ArrayBuffer → pdf.js load
    libDoc.save().then((bytes: Uint8Array) => {
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      return pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    }).then((pdfDoc: pdfjsLib.PDFDocumentProxy) => {
      setPdfJsDoc(pdfDoc);
      setHasFile(true);

      // R13: Parse text objects from pdf.js and store in Zustand
      const parser = new PdfParser(pdfDoc);
      parser.parseAllPages().then((pageMap) => {
        const allObjects: SerializableTextObject[] = [];
        pageMap.forEach((objs, pageIndex) => {
          for (const obj of objs) {
            allObjects.push({
              id: `text-${pageIndex}-${obj.objectRef || Math.random().toString(36).slice(2)}`,
              content: obj.content,
              pageIndex,
              x: obj.bbox.x,
              y: obj.bbox.y,
              width: obj.bbox.width,
              height: obj.bbox.height,
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
      setPdfError(err instanceof Error ? err.message : "Failed to load PDF");
    });
  }, [pdfDocument, reloadTrigger]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if (isMod && e.key === "z" && e.shiftKey) { e.preventDefault(); redo(); }
      if (isMod && e.key === "y") { e.preventDefault(); redo(); }
      if (e.key === "Escape") { clearSelection(); }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedObjects.length > 0) {
        e.preventDefault();
        // Snapshot all selected text objects before removal for undo
        const toRemove = selectedObjects
          .filter((obj) => obj.type === 'text')
          .map((obj) => textObjects.find((t) => t.id === obj.id))
          .filter(Boolean) as SerializableTextObject[];
        if (toRemove.length > 0) {
          const removed = [...toRemove];
          useHistoryStore.getState().push({
            label: 'Delete text',
            undo: () => removed.forEach((obj) => useDocumentStore.getState().addTextObject(obj)),
            redo: () => removed.forEach((obj) => useDocumentStore.getState().removeTextObject(obj.id)),
          });
          removed.forEach((obj) => removeTextObject(obj.id));
        }
        clearSelection();
      }

      // Tool shortcuts (only when not typing in an input)
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (isMod) return; // don't override Cmd/Ctrl combos

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
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, clearSelection, selectedObjects]);

  if (!pdfDocument) {
    return (
      <div className="flex flex-col h-screen bg-bg-base">
        <TopBar />
        <main className="flex-1 overflow-hidden">
          <EmptyState
            onFile={async (file) => {
              try {
                await handleFile(file);
              } catch (err) {
                setPdfError(err instanceof Error ? err.message : "Failed to open file");
              }
            }}
          />
        </main>
      </div>
    );
  }

  const pages = pdfDocument.getPages();

  return (
    <div className="flex flex-col h-screen bg-bg-base overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        {deviceType !== "mobile" && <LeftSidebar open={leftSidebarOpen} />}

        {/* Canvas */}
        <div
          className="flex-1 overflow-auto bg-bg-base relative"
          style={{ touchAction: "none" }}
          onClick={(e) => {
            if ((e.target as HTMLElement).classList.contains("canvas-scroll-root")) {
              clearSelection();
            }
          }}
        >
          {/* Pages wrapper with zoom/pan transform */}
          <div
            className="canvas-scroll-root pt-8 pb-24 px-8"
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
              transformOrigin: "top center",
            }}
          >
            {pages.map((page, i) => (
              <div
                key={i}
                ref={(el) => { pageRefs.current[i] = el; }}
              >
                <PageCanvas
                  page={page}
                  pageIndex={i}
                  isActive={i === activePageIndex}
                  onPageClick={() => setActivePage(i)}
                  onTextEdit={(id) => { /* wired in R11 */ }}
                  zoom={zoom}
                />
              </div>
            ))}
          </div>

          {pages.length > 0 && <ZoomControl />}
        </div>

        {deviceType !== "mobile" && <RightPanel open={rightPanelOpen} />}
      </div>

      {deviceType === "mobile" && (
        <>
          <ToolFAB />
          <MobileBottomSheet />
        </>
      )}
    </div>
  );
}

// ── PageCanvas ──────────────────────────────────────────────────
interface PageCanvasProps {
  page: Page;
  pageIndex: number;
  isActive: boolean;
  onPageClick: () => void;
  onTextEdit: (objectId: string) => void;
  zoom: number;
}

function PageCanvas({ page, pageIndex, isActive, onPageClick, onTextEdit, zoom }: PageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { textObjects, selectedObjects, selectObject, clearSelection, setDirty, reloadTrigger,
    setTextObjects, addTextObject } = useDocumentStore();
  const { activeTool, toolOptions } = useToolStore();
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const renderScale = zoom;

  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();

  // Text objects for THIS page only
  const pageTextObjects = textObjects.filter((o) => o.pageIndex === pageIndex);
  const pageSelected = selectedObjects.filter((o) => o.pageIndex === pageIndex);

  // Images and annotations from pdf-lib class instances (not yet in Zustand)
  const pageObjects = page.getObjects();

  // pdf.js doc comes from Zustand — reactively updated after setPdfJsDoc()
  const { pdfJsDoc } = useDocumentStore();

  // Render with pdf.js when pdfJsDoc or scale changes
  useEffect(() => {
    if (!pdfJsDoc || !canvasRef.current) return;

    let cancelled = false;
    let task: pdfjsLib.RenderTask | null = null;

    (async () => {
      try {
        const pdfPage = await pdfJsDoc.getPage(pageIndex + 1);
        if (cancelled) return;

        const viewport = pdfPage.getViewport({ scale: renderScale });
        const canvas = canvasRef.current!;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${pageWidth}px`;
        canvas.style.height = `${pageHeight}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        task = pdfPage.render({
          canvasContext: ctx,
          viewport,
          intent: "display",
        });

        if (task) await task.promise;
      } catch (err: unknown) {
        if ((err as { name?: string })?.name !== "RenderingCancelledException") {
          console.error(`Page ${pageIndex} render error:`, err);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (task) task.cancel();
    };
  }, [pdfJsDoc, pageIndex, renderScale, pageWidth, pageHeight]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative mx-auto mb-4 bg-white page-shadow select-none",
        isActive ? "ring-2 ring-accent" : "ring-1 ring-border"
      )}
      style={{ width: pageWidth, height: pageHeight }}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        // If text tool active, create new text at click position
        if (activeTool === 'text') {
          e.preventDefault();
          e.stopPropagation();
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          const newId = `text-${pageIndex}-${Date.now()}`;
          const newObj = {
            id: newId,
            content: 'New Text',
            pageIndex,
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            width: 200,
            height: 30,
            fontSize: toolOptions.fontSize ?? 14,
            fontFamily: toolOptions.fontFamily ?? 'DM Sans',
            fontWeight: toolOptions.fontWeight ?? 'normal',
            fontStyle: toolOptions.fontStyle ?? 'normal',
            color: toolOptions.textColor ?? '#F0EDE8',
            textAlign: toolOptions.textAlign ?? 'left',
            rotation: 0,
            objectRef: "new",
          };
          useHistoryStore.getState().push({
            label: 'Add text',
            undo: () => useDocumentStore.getState().removeTextObject(newId),
            redo: () => useDocumentStore.getState().addTextObject(newObj),
          });
          addTextObject(newObj);
          setEditingTextId(newId);
          return;
        }
        // Select tool: deselect if clicking page background
        if (activeTool === 'select') {
          clearSelection();
        }
      }}
      onClick={(e) => { e.stopPropagation(); onPageClick(); }}
    >
      {/* pdf.js render canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ display: "block" }}
      />

      {/* Text overlays — from Zustand textObjects */}
      {pageTextObjects.map((textObj) => {
        const isSelected = pageSelected.some((o) => o.id === textObj.id);

        return (
          <div
            key={textObj.id}
            className="absolute cursor-text"
            style={{
              left: textObj.x,
              top: textObj.y,
              width: textObj.width,
              minHeight: textObj.height,
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (activeTool === "select") {
                selectObject({ id: textObj.id, type: "text", pageIndex });
              } else if (activeTool === "text") {
                setEditingTextId(textObj.id);
              }
            }}
          >
            {isSelected && (
              <SelectionHandles
                bbox={{ x: textObj.x, y: textObj.y, width: textObj.width, height: textObj.height, rotation: textObj.rotation }}
                onRotate={() => {}}
              />
            )}
            {editingTextId === textObj.id ? (
              <TextEditOverlay
                textObject={textObj}
                onClose={() => setEditingTextId(null)}
                onSave={(newContent) => {
                  const oldContent = textObj.content;
                  useHistoryStore.getState().push({
                    label: 'Edit text',
                    undo: () => useDocumentStore.getState().updateTextObject(textObj.id, { content: oldContent }),
                    redo: () => useDocumentStore.getState().updateTextObject(textObj.id, { content: newContent }),
                  });
                  useDocumentStore.getState().updateTextObject(textObj.id, { content: newContent });
                  setDirty(true);
                  setEditingTextId(null);
                }}
              />
            ) : (
              <span
                className="block overflow-hidden whitespace-pre-wrap break-words"
                style={{
                  fontFamily: textObj.fontFamily,
                  fontSize: textObj.fontSize,
                  fontWeight: textObj.fontWeight,
                  fontStyle: textObj.fontStyle,
                  color: textObj.color,
                  textAlign: textObj.textAlign,
                  lineHeight: 1.4,
                }}
              >
                {textObj.content}
              </span>
            )}
          </div>
        );
      })}

      {/* Image overlays */}
      {pageObjects.images.map((imgObj: any) => {
        const bbox = imgObj.getBBox();
        const isSelected = pageSelected.some((o) => o.id === imgObj.getId());
        return (
          <div
            key={imgObj.getId()}
            className="absolute cursor-move"
            style={{
              left: bbox.x, top: bbox.y,
              width: bbox.width, height: bbox.height,
              opacity: imgObj.getOpacity?.() ?? 1,
            }}
            onClick={(e) => {
              e.stopPropagation();
              selectObject({ id: imgObj.getId(), type: "image", pageIndex });
            }}
          >
            {isSelected && <SelectionHandles bbox={bbox} onRotate={() => {}} />}
            <img
              src={imgObj.getSrc?.() ?? ""}
              className="w-full h-full object-cover pointer-events-none"
              draggable={false}
              alt=""
            />
          </div>
        );
      })}

      {/* Annotation overlays */}
      {pageObjects.annotations.map((ann: AnnotationObject) => {
        const bbox = ann.getRect();
        const isSelected = pageSelected.some((o) => o.id === ann.getId());
        return (
          <div
            key={ann.getId()}
            className="absolute"
            style={{
              left: bbox.x, top: bbox.y,
              width: bbox.width, height: bbox.height,
              opacity: ann.getOpacity(),
            }}
            onClick={(e) => {
              e.stopPropagation();
              selectObject({ id: ann.getId(), type: "annotation", pageIndex });
            }}
          >
            {isSelected && <SelectionHandles bbox={bbox} onRotate={() => {}} />}
            <AnnotationView annotation={ann} />
          </div>
        );
      })}
    </div>
  );
}

// ── AnnotationView ─────────────────────────────────────────────
function AnnotationView({ annotation }: { annotation: AnnotationObject }) {
  const type = annotation.getType();
  const color = annotation.getColor();
  const opacity = annotation.getOpacity();

  switch (type) {
    case "highlight":
      return (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundColor: color, opacity: opacity * 0.35 }}
        />
      );
    case "underline":
      return (
        <div
          className="absolute bottom-0 left-0 right-0 h-0.5 pointer-events-none"
          style={{ backgroundColor: color }}
        />
      );
    case "strikethrough":
      return (
        <div
          className="absolute top-1/2 left-0 right-0 h-0.5 pointer-events-none -translate-y-1/2"
          style={{ backgroundColor: color }}
        />
      );
    case "sticky": {
      return (
        <div
          className="w-full h-full p-2 rounded shadow text-xs overflow-hidden"
          style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
        >
          {annotation.getContents()}
        </div>
      );
    }
    case "shape": {
      return (
        <div
          className="w-full h-full pointer-events-none"
          style={{ border: `2px solid ${color}` }}
        />
      );
    }
    case "textbox": {
      return (
        <div
          className="w-full h-full p-1 text-xs"
          style={{ color }}
        >
          {annotation.getContents()}
        </div>
      );
    }
    default:
      return null;
  }
}
