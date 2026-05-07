"use client";
import {
  useEffect, useRef, useCallback, useState, useMemo,
} from "react";
import * as pdfjsLib from 'pdfjs-dist/legacy';
import { useDocumentStore } from "@/stores/documentStore";
import type { AnnotationObject as ZustandAnnotation } from "@/stores/documentStore";
import { useUIStore } from "@/stores/uiStore";
import { useToolStore } from "@/stores/toolStore";
import { useHistoryStore } from "@/stores/historyStore";
import { useFileHandler } from "@/hooks/useFileHandler";
import { useAutosave } from "@/hooks/useAutosave";
import { PdfParser } from "@/hooks/usePdfParser";
import type { SerializableTextObject, SerializableImageObject } from "@/stores/documentStore";
import { EmptyState } from "@/components/layout/EmptyState";
import { TopBar } from "@/components/layout/TopBar";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { RightPanel } from "@/components/panels/RightPanel";
import { ZoomControl } from "@/components/canvas/ZoomControl";
import { MobileBottomSheet } from "@/components/mobile/MobileBottomSheet";
import { ToolFAB } from "@/components/mobile/ToolFAB";
import { TextEditOverlay } from "@/components/canvas/TextEditOverlay";
import { SelectionHandles } from "@/components/canvas/SelectionHandles";
import { ContextMenu } from "@/components/canvas/ContextMenu";
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
    annotations, addAnnotation, removeAnnotation, updateAnnotation,
    imageObjects, addImageObject, removeImageObject, updateImageObject,
  } = useDocumentStore();
  const { zoom, panOffset, setPanOffset, leftSidebarOpen, rightPanelOpen } = useUIStore();
  const { undo, redo, canUndo, canRedo, push } = useHistoryStore();
  const { activeTool } = useToolStore();
  const deviceType = useDeviceType();
  const { handleFile } = useFileHandler();
  const [hasFile, setHasFile] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

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
      if (isMod && e.key === "d") { e.preventDefault(); useDocumentStore.getState().duplicateSelected(); }
      if (isMod && e.key === "c") { e.preventDefault(); useDocumentStore.getState().copySelected(); }
      if (isMod && e.key === "v") { e.preventDefault(); useDocumentStore.getState().pasteClipboard(); }
      if (e.key === "Escape") { clearSelection(); setContextMenu(null); }
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
        // Also handle image deletion (R43-R47)
        const toRemoveImages = selectedObjects
          .filter((obj) => obj.type === 'image');
        if (toRemoveImages.length > 0) {
          const removedImgs = [...toRemoveImages];
          useHistoryStore.getState().push({
            label: 'Delete image',
            undo: () => removedImgs.forEach((obj) => {
              const img = useDocumentStore.getState().imageObjects.find((i) => i.id === obj.id);
              if (img) addImageObject(img);
            }),
            redo: () => removedImgs.forEach((obj) => removeImageObject(obj.id)),
          });
          toRemoveImages.forEach((obj) => removeImageObject(obj.id));
        }
        // Also handle annotation deletion
        const toRemoveAnnotations = selectedObjects
          .filter((obj) => obj.type === 'annotation');
        if (toRemoveAnnotations.length > 0) {
          const removedAnns = [...toRemoveAnnotations];
          useHistoryStore.getState().push({
            label: 'Delete annotation',
            undo: () => removedAnns.forEach((obj) => {
              const ann = useDocumentStore.getState().annotations.find((a) => a.id === obj.id);
              if (ann) addAnnotation(ann);
            }),
            redo: () => removedAnns.forEach((obj) => removeAnnotation(obj.id)),
          });
          toRemoveAnnotations.forEach((obj) => removeAnnotation(obj.id));
        }
        clearSelection();
      }

      // Tool shortcuts (only when not typing in an input)
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      // Tab navigation between text objects (R27)
      if (e.key === 'Tab' && selectedObjects.length > 0) {
        e.preventDefault();
        const currentPageObjs = textObjects
          .filter((o) => o.pageIndex === activePageIndex)
          .sort((a, b) => a.y - b.y || a.x - b.x);
        const currentId = selectedObjects[0]?.id;
        const idx = currentPageObjs.findIndex((o) => o.id === currentId);
        const next = e.shiftKey
          ? currentPageObjs[(idx - 1 + currentPageObjs.length) % currentPageObjs.length]
          : currentPageObjs[(idx + 1) % currentPageObjs.length];
        if (next) {
          selectObject({ id: next.id, type: 'text', pageIndex: next.pageIndex });
        }
        return;
      }

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
  }, [undo, redo, clearSelection, selectedObjects, textObjects, activePageIndex]);

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
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY });
          }}
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

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            {
              label: "Edit",
              action: () => {
                if (selectedObjects.length === 1) {
                  const id = selectedObjects[0].id;
                  // Trigger edit via a custom event so TextEditOverlay can pick it up
                  window.dispatchEvent(new CustomEvent("edit-text-object", { detail: { id } }));
                }
              },
              disabled: selectedObjects.length !== 1,
            },
            {
              label: "Duplicate",
              action: () => useDocumentStore.getState().duplicateSelected(),
              disabled: selectedObjects.length === 0,
            },
            { label: "", action: () => {}, divider: true },
            {
              label: "Delete",
              action: () => {
                const toRemove = selectedObjects
                  .filter((obj) => obj.type === "text")
                  .map((obj) => textObjects.find((t) => t.id === obj.id))
                  .filter(Boolean) as SerializableTextObject[];
                if (toRemove.length > 0) {
                  const removed = [...toRemove];
                  useHistoryStore.getState().push({
                    label: "Delete text",
                    undo: () => removed.forEach((obj) => useDocumentStore.getState().addTextObject(obj)),
                    redo: () => removed.forEach((obj) => useDocumentStore.getState().removeTextObject(obj.id)),
                  });
                  removed.forEach((obj) => removeTextObject(obj.id));
                }
                const toRemoveAnns = selectedObjects
                  .filter((obj) => obj.type === "annotation");
                if (toRemoveAnns.length > 0) {
                  const removedAnns = [...toRemoveAnns];
                  useHistoryStore.getState().push({
                    label: "Delete annotation",
                    undo: () => removedAnns.forEach((obj) => {
                      const ann = useDocumentStore.getState().annotations.find((a) => a.id === obj.id);
                      if (ann) addAnnotation(ann);
                    }),
                    redo: () => removedAnns.forEach((obj) => removeAnnotation(obj.id)),
                  });
                  toRemoveAnns.forEach((obj) => removeAnnotation(obj.id));
                }
                clearSelection();
              },
              disabled: selectedObjects.length === 0,
            },
          ]}
          onClose={() => setContextMenu(null)}
        />
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
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const { textObjects, selectedObjects, selectObject, clearSelection, setDirty, reloadTrigger,
    setTextObjects, addTextObject, annotations, addAnnotation, updateAnnotation,
    imageObjects, updateImageObject, addImageObject } = useDocumentStore();
  const { activeTool, toolOptions } = useToolStore();
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const renderScale = zoom;

  // Drawing state for freehand tool
  const [isDrawingStroke, setIsDrawingStroke] = useState(false);
  const drawingPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const drawCanvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  // Shape preview state
  const [shapePreview, setShapePreview] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [shapeStartPos, setShapeStartPos] = useState<{ x: number; y: number } | null>(null);

  // Sticky note editing state
  const [editingStickyId, setEditingStickyId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState("");

  // Comment popover state
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);

  // Listen for edit-text-object event from context menu
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail.id;
      const textObj = textObjects.find((t) => t.id === id);
      if (textObj && textObj.pageIndex === pageIndex) {
        setEditingTextId(id);
      }
    };
    window.addEventListener("edit-text-object", handler);
    return () => window.removeEventListener("edit-text-object", handler);
  }, [textObjects, pageIndex]);

  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();

  // Text objects for THIS page only
  const pageTextObjects = textObjects.filter((o) => o.pageIndex === pageIndex);
  const pageSelected = selectedObjects.filter((o) => o.pageIndex === pageIndex);

  // Zustand annotations for THIS page only
  const pageAnnotations = annotations.filter((a) => a.pageIndex === pageIndex);

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

  // Drawing canvas setup
  useEffect(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    canvas.width = pageWidth;
    canvas.height = pageHeight;
    canvas.style.width = `${pageWidth}px`;
    canvas.style.height = `${pageHeight}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      drawCanvasCtxRef.current = ctx;
    }
  }, [pageWidth, pageHeight]);

  // Redraw existing drawing annotations when annotations change
  useEffect(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas || !drawCanvasCtxRef.current) return;
    const ctx = drawCanvasCtxRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const drawingAnnotations = annotations.filter(
      (a) => a.pageIndex === pageIndex && a.type === 'drawing' && a.imageData
    ) as Array<ZustandAnnotation & { type: 'drawing'; imageData: string }>;

    for (const ann of drawingAnnotations) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, ann.x, ann.y, ann.width, ann.height);
      };
      img.src = ann.imageData;
    }
  }, [annotations, pageIndex, pageWidth, pageHeight]);

  const getPointerPosition = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (e.clientX - rect.left),
      y: (e.clientY - rect.top),
    };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const pos = getPointerPosition(e);

    // Highlight tool - start drag
    if (activeTool === 'highlight' || activeTool === 'underline' || activeTool === 'strikethrough') {
      setShapeStartPos(pos);
      setShapePreview({ x: pos.x, y: pos.y, width: 0, height: 0 });
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // Shape tools
    if (activeTool === 'rectangle' || activeTool === 'ellipse' || activeTool === 'arrow' || activeTool === 'line') {
      setShapeStartPos(pos);
      setShapePreview({ x: pos.x, y: pos.y, width: 0, height: 0 });
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // Draw tool - start freehand
    if (activeTool === 'draw') {
      setIsDrawingStroke(true);
      drawingPointsRef.current = [pos];
      const ctx = drawCanvasCtxRef.current;
      if (ctx) {
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.strokeStyle = toolOptions.color;
        ctx.lineWidth = toolOptions.brushSize ?? 2;
        ctx.globalAlpha = toolOptions.opacity;
      }
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // Sticky note tool
    if (activeTool === 'sticky') {
      const id = `sticky-${pageIndex}-${Date.now()}`;
      const newSticky: ZustandAnnotation & { type: 'sticky' } = {
        id,
        type: 'sticky',
        pageIndex,
        x: pos.x - 40,
        y: pos.y - 40,
        width: 80,
        height: 80,
        color: toolOptions.highlightColor ?? '#FFE066',
        opacity: 1,
        content: '',
      };
      addAnnotation(newSticky);
      selectObject({ id, type: 'annotation', pageIndex });
      return;
    }

    // Comment tool
    if (activeTool === 'comment') {
      const id = `comment-${pageIndex}-${Date.now()}`;
      const newComment: ZustandAnnotation & { type: 'comment' } = {
        id,
        type: 'comment',
        pageIndex,
        x: pos.x - 12,
        y: pos.y - 24,
        width: 24,
        height: 24,
        color: '#FF6B6B',
        opacity: 1,
        content: '',
        author: 'User',
        timestamp: Date.now(),
      };
      addAnnotation(newComment);
      selectObject({ id, type: 'annotation', pageIndex });
      return;
    }

    // Text tool - create new text at click position
    if (activeTool === 'text') {
      e.preventDefault();
      e.stopPropagation();
      const newId = `text-${pageIndex}-${Date.now()}`;
      const newObj = {
        id: newId,
        content: 'New Text',
        pageIndex,
        x: pos.x,
        y: pos.y,
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

    // Image tool - add new image at click position (R46)
    if (activeTool === 'image') {
      e.preventDefault();
      e.stopPropagation();
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async (ev) => {
        const file = (ev.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (re) => {
          const src = re.target?.result as string;
          const id = `img-${Date.now()}`;
          const newObj: SerializableImageObject = {
            id,
            pageIndex,
            x: pos.x - 100,
            y: pos.y - 75,
            width: 200,
            height: 150,
            rotation: 0,
            src,
            opacity: 1,
          };
          addImageObject(newObj);
          selectObject({ id, type: 'image', pageIndex });
        };
        reader.readAsDataURL(file);
      };
      input.click();
      return;
    }

    // Select tool: deselect if clicking page background
    if (activeTool === 'select') {
      clearSelection();
    }
  }, [activeTool, pageIndex, getPointerPosition, toolOptions, addAnnotation, selectObject, addTextObject, clearSelection, addImageObject]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!shapeStartPos && !isDrawingStroke) return;
    const pos = getPointerPosition(e);

    // Shape preview
    if (shapeStartPos && (activeTool === 'highlight' || activeTool === 'underline' || activeTool === 'strikethrough'
      || activeTool === 'rectangle' || activeTool === 'ellipse' || activeTool === 'arrow' || activeTool === 'line')) {
      setShapePreview({
        x: Math.min(shapeStartPos.x, pos.x),
        y: Math.min(shapeStartPos.y, pos.y),
        width: Math.abs(pos.x - shapeStartPos.x),
        height: Math.abs(pos.y - shapeStartPos.y),
      });
      return;
    }

    // Freehand drawing
    if (isDrawingStroke && activeTool === 'draw') {
      const ctx = drawCanvasCtxRef.current;
      if (ctx) {
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      }
      drawingPointsRef.current.push(pos);
      return;
    }
  }, [shapeStartPos, isDrawingStroke, activeTool, getPointerPosition]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const pos = getPointerPosition(e);

    // Shape creation on mouse up
    if (shapeStartPos && shapePreview && (activeTool === 'highlight' || activeTool === 'underline' || activeTool === 'strikethrough'
      || activeTool === 'rectangle' || activeTool === 'ellipse' || activeTool === 'arrow' || activeTool === 'line')) {
      const id = `${activeTool}-${pageIndex}-${Date.now()}`;
      const baseAnnotation = {
        id,
        pageIndex,
        x: shapePreview.x,
        y: shapePreview.y,
        width: Math.max(shapePreview.width, 1),
        height: Math.max(shapePreview.height, 1),
        color: toolOptions.color,
        opacity: toolOptions.opacity,
      };

      let newAnnotation: ZustandAnnotation;
      if (activeTool === 'highlight') {
        newAnnotation = {
          ...baseAnnotation,
          type: 'highlight',
          color: toolOptions.highlightColor ?? '#FFFF00',
          opacity: 0.3,
        } as ZustandAnnotation & { type: 'highlight' };
      } else if (activeTool === 'underline' || activeTool === 'strikethrough') {
        newAnnotation = {
          ...baseAnnotation,
          type: activeTool,
          fontSize: toolOptions.fontSize ?? 14,
        } as ZustandAnnotation & { type: 'underline' | 'strikethrough' };
      } else {
        newAnnotation = {
          ...baseAnnotation,
          type: activeTool as 'rectangle' | 'ellipse' | 'arrow' | 'line',
          strokeWidth: toolOptions.strokeWidth ?? 2,
          filled: toolOptions.fillColor !== 'transparent',
        } as ZustandAnnotation & { type: 'rectangle' | 'ellipse' | 'arrow' | 'line' };
      }

      addAnnotation(newAnnotation);
      selectObject({ id, type: 'annotation', pageIndex });
      setShapeStartPos(null);
      setShapePreview(null);
      return;
    }

    // Freehand drawing - save stroke
    if (isDrawingStroke && activeTool === 'draw') {
      const canvas = drawCanvasRef.current;
      if (canvas) {
        const imageData = canvas.toDataURL('image/png');
        const id = `drawing-${pageIndex}-${Date.now()}`;
        const boundingBox = getBoundingBoxOfPoints(drawingPointsRef.current);
        const newAnnotation: ZustandAnnotation & { type: 'drawing' } = {
          id,
          type: 'drawing',
          pageIndex,
          x: boundingBox.x,
          y: boundingBox.y,
          width: boundingBox.width,
          height: boundingBox.height,
          color: toolOptions.color,
          opacity: toolOptions.opacity,
          strokeWidth: toolOptions.brushSize ?? 2,
          points: [...drawingPointsRef.current],
          imageData,
        };
        addAnnotation(newAnnotation);
        selectObject({ id, type: 'annotation', pageIndex });

        // Clear drawing canvas for next stroke
        const ctx = drawCanvasCtxRef.current;
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      setIsDrawingStroke(false);
      drawingPointsRef.current = [];
      return;
    }

    setShapeStartPos(null);
    setShapePreview(null);
  }, [shapeStartPos, shapePreview, activeTool, pageIndex, toolOptions, addAnnotation, selectObject, getPointerPosition, isDrawingStroke]);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pos = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    // Check if double-clicked on a sticky note
    for (const ann of pageAnnotations) {
      if (ann.type === 'sticky' && isPointInRect(pos, ann)) {
        setEditingStickyId(ann.id);
        return;
      }
      if (ann.type === 'comment' && isPointInRect(pos, ann)) {
        setEditingCommentId(ann.id);
        setCommentInput(ann.content);
        return;
      }
    }
  }, [pageAnnotations]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative mx-auto mb-4 bg-white page-shadow select-none",
        isActive ? "ring-2 ring-accent" : "ring-1 ring-border"
      )}
      style={{ width: pageWidth, height: pageHeight }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onClick={(e) => { e.stopPropagation(); onPageClick(); }}
    >
      {/* pdf.js render canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ display: "block" }}
      />

      {/* Freehand drawing canvas overlay */}
      <canvas
        ref={drawCanvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 10 }}
      />

      {/* Shape preview overlay */}
      {shapePreview && shapeStartPos && (
        <ShapePreview
          type={activeTool as 'highlight' | 'underline' | 'strikethrough' | 'rectangle' | 'ellipse' | 'arrow' | 'line'}
          preview={shapePreview}
          color={activeTool === 'highlight' ? (toolOptions.highlightColor ?? '#FFFF00') : toolOptions.color}
          strokeWidth={toolOptions.strokeWidth ?? 2}
          opacity={activeTool === 'highlight' ? 0.3 : toolOptions.opacity}
        />
      )}

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
                if (e.shiftKey) {
                  // Multi-select: toggle this object in selection
                  const isCurrentlySelected = pageSelected.some((o) => o.id === textObj.id);
                  if (isCurrentlySelected) {
                    useDocumentStore.getState().removeFromSelection(textObj.id);
                  } else {
                    useDocumentStore.getState().addToSelection({ id: textObj.id, type: "text", pageIndex });
                  }
                } else {
                  selectObject({ id: textObj.id, type: "text", pageIndex });
                }
              } else if (activeTool === "text") {
                setEditingTextId(textObj.id);
              }
            }}
          >
            {isSelected && (
              <SelectionHandles
                bbox={{ x: textObj.x, y: textObj.y, width: textObj.width, height: textObj.height, rotation: textObj.rotation }}
                onResize={(handle, dx, dy) => {
                  let newX = textObj.x, newY = textObj.y, newW = textObj.width, newH = textObj.height;
                  if (handle === 'nw') { newX += dx; newY += dy; newW -= dx; newH -= dy; }
                  else if (handle === 'ne') { newY += dy; newW += dx; newH -= dy; }
                  else if (handle === 'se') { newW += dx; newH += dy; }
                  else if (handle === 'sw') { newX += dx; newW -= dx; newH += dy; }
                  else if (handle === 'n') { newY += dy; newH -= dy; }
                  else if (handle === 's') { newH += dy; }
                  else if (handle === 'e') { newW += dx; }
                  else if (handle === 'w') { newX += dx; newW -= dx; }
                  if (newW > 10 && newH > 10) {
                    useHistoryStore.getState().push({
                      label: 'Resize text',
                      undo: () => useDocumentStore.getState().updateTextObject(textObj.id, { x: textObj.x, y: textObj.y, width: textObj.width, height: textObj.height }),
                      redo: () => useDocumentStore.getState().updateTextObject(textObj.id, { x: newX, y: newY, width: newW, height: newH }),
                    });
                    useDocumentStore.getState().updateTextObject(textObj.id, { x: newX, y: newY, width: newW, height: newH });
                    setDirty(true);
                  }
                }}
                onRotateStart={() => {}}
                onRotateMove={(deg) => {
                  useDocumentStore.getState().updateTextObject(textObj.id, { rotation: deg });
                  setDirty(true);
                }}
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
                className="block overflow-hidden whitespace-pre-wrap break-words pointer-events-none"
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

      {/* Image overlays — pdf-engine ImageObject instances */}
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
              transform: `rotate(${bbox.rotation ?? 0}deg)`,
              opacity: imgObj.getOpacity?.() ?? 1,
            }}
            onClick={(e) => {
              e.stopPropagation();
              selectObject({ id: imgObj.getId(), type: "image", pageIndex });
            }}
          >
            {isSelected && (
              <SelectionHandles
                bbox={bbox}
                onResize={(handle, dx, dy) => {
                  let newX = bbox.x, newY = bbox.y, newW = bbox.width, newH = bbox.height;
                  if (handle === 'nw') { newX += dx; newY += dy; newW -= dx; newH -= dy; }
                  else if (handle === 'ne') { newY += dy; newW += dx; newH -= dy; }
                  else if (handle === 'se') { newW += dx; newH += dy; }
                  else if (handle === 'sw') { newX += dx; newW -= dx; newH += dy; }
                  else if (handle === 'n') { newY += dy; newH -= dy; }
                  else if (handle === 's') { newH += dy; }
                  else if (handle === 'e') { newW += dx; }
                  else if (handle === 'w') { newX += dx; newW -= dx; }
                  if (newW > 10 && newH > 10) {
                    imgObj.setBBox({ x: newX, y: newY, width: newW, height: newH });
                    setDirty(true);
                  }
                }}
                onRotateStart={() => {}}
                onRotateMove={(deg) => {
                  imgObj.setRotation(deg);
                  setDirty(true);
                }}
              />
            )}
            <img
              src={imgObj.getSrc?.() ?? ""}
              className="w-full h-full object-cover pointer-events-none"
              draggable={false}
              alt=""
            />
          </div>
        );
      })}

      {/* Zustand ImageObject overlays (R43-R47) — user-added images */}
      {imageObjects
        .filter((img) => img.pageIndex === pageIndex)
        .map((img) => {
          const isSelected = pageSelected.some((o) => o.id === img.id);
          return (
            <div
              key={img.id}
              className="absolute cursor-move"
              style={{
                left: img.x, top: img.y,
                width: img.width, height: img.height,
                transform: `rotate(${img.rotation}deg)`,
                opacity: img.opacity ?? 1,
              }}
              onClick={(e) => {
                e.stopPropagation();
                selectObject({ id: img.id, type: "image", pageIndex });
              }}
            >
              {isSelected && (
                <SelectionHandles
                  bbox={{ x: img.x, y: img.y, width: img.width, height: img.height, rotation: img.rotation }}
                  onResize={(handle, dx, dy) => {
                    let newX = img.x, newY = img.y, newW = img.width, newH = img.height;
                    if (handle === 'nw') { newX += dx; newY += dy; newW -= dx; newH -= dy; }
                    else if (handle === 'ne') { newY += dy; newW += dx; newH -= dy; }
                    else if (handle === 'se') { newW += dx; newH += dy; }
                    else if (handle === 'sw') { newX += dx; newW -= dx; newH += dy; }
                    else if (handle === 'n') { newY += dy; newH -= dy; }
                    else if (handle === 's') { newH += dy; }
                    else if (handle === 'e') { newW += dx; }
                    else if (handle === 'w') { newX += dx; newW -= dx; }
                    if (newW > 10 && newH > 10) {
                      updateImageObject(img.id, { x: newX, y: newY, width: newW, height: newH });
                    }
                  }}
                  onRotateStart={() => {}}
                  onRotateMove={(deg) => {
                    updateImageObject(img.id, { rotation: deg });
                  }}
                />
              )}
              <img
                src={img.src}
                className="w-full h-full object-contain pointer-events-none"
                draggable={false}
                alt=""
              />
            </div>
          );
        })}

      {/* Zustand Annotation overlays (R35-R42) */}
      {pageAnnotations.map((ann) => {
        const isSelected = pageSelected.some((o) => o.id === ann.id);
        return (
          <div
            key={ann.id}
            className="absolute cursor-pointer"
            style={{
              left: ann.x,
              top: ann.y,
              width: ann.width,
              height: ann.height,
              zIndex: 20,
            }}
            onClick={(e) => {
              e.stopPropagation();
              selectObject({ id: ann.id, type: "annotation", pageIndex });
              if (ann.type === 'comment') {
                setActiveCommentId(ann.id === activeCommentId ? null : ann.id);
              }
            }}
          >
            {isSelected && (
              <SelectionHandles
                bbox={{ x: ann.x, y: ann.y, width: ann.width, height: ann.height, rotation: 0 }}
                onResize={(handle, dx, dy) => {
                  let newX = ann.x, newY = ann.y, newW = ann.width, newH = ann.height;
                  if (handle === 'nw') { newX += dx; newY += dy; newW -= dx; newH -= dy; }
                  else if (handle === 'ne') { newY += dy; newW += dx; newH -= dy; }
                  else if (handle === 'se') { newW += dx; newH += dy; }
                  else if (handle === 'sw') { newX += dx; newW -= dx; newH += dy; }
                  else if (handle === 'n') { newY += dy; newH -= dy; }
                  else if (handle === 's') { newH += dy; }
                  else if (handle === 'e') { newW += dx; }
                  else if (handle === 'w') { newX += dx; newW -= dx; }
                  if (newW > 10 && newH > 10) {
                    updateAnnotation(ann.id, { x: newX, y: newY, width: newW, height: newH });
                  }
                }}
                onRotateStart={() => {}}
                onRotateMove={() => {}}
              />
            )}
            <ZustandAnnotationView
              annotation={ann}
              isEditing={editingStickyId === ann.id || editingCommentId === ann.id}
              onStickyEdit={(content) => {
                updateAnnotation(ann.id, { content } as Partial<ZustandAnnotation>);
                setEditingStickyId(null);
              }}
              onCommentEdit={(content) => {
                updateAnnotation(ann.id, { content } as Partial<ZustandAnnotation>);
                setEditingCommentId(null);
              }}
              commentInput={commentInput}
              onCommentInputChange={setCommentInput}
              activeCommentId={activeCommentId}
              onCommentPopoverClose={() => setActiveCommentId(null)}
              pageAnnotations={pageAnnotations}
            />
          </div>
        );
      })}

      {/* pdf-engine Annotation overlays (existing) */}
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
            {isSelected && <SelectionHandles bbox={bbox} onResize={() => {}} onRotateStart={() => {}} onRotateMove={() => {}} />}
            <AnnotationView annotation={ann} />
          </div>
        );
      })}
    </div>
  );
}

// ── ShapePreview ────────────────────────────────────────────────
function ShapePreview({
  type,
  preview,
  color,
  strokeWidth,
  opacity,
}: {
  type: 'highlight' | 'underline' | 'strikethrough' | 'rectangle' | 'ellipse' | 'arrow' | 'line';
  preview: { x: number; y: number; width: number; height: number };
  color: string;
  strokeWidth: number;
  opacity: number;
}) {
  if (type === 'highlight') {
    return (
      <div
        className="absolute pointer-events-none"
        style={{
          left: preview.x,
          top: preview.y,
          width: preview.width,
          height: preview.height,
          backgroundColor: color,
          opacity: opacity * 0.35,
        }}
      />
    );
  }
  if (type === 'underline' || type === 'strikethrough') {
    const isUnderline = type === 'underline';
    return (
      <div
        className="absolute pointer-events-none"
        style={{
          left: preview.x,
          top: isUnderline ? preview.y + preview.height - 2 : preview.y + preview.height / 2 - 1,
          width: preview.width,
          height: 2,
          backgroundColor: color,
        }}
      />
    );
  }
  if (type === 'rectangle') {
    return (
      <div
        className="absolute pointer-events-none border-2"
        style={{
          left: preview.x,
          top: preview.y,
          width: preview.width,
          height: preview.height,
          borderColor: color,
          borderWidth: strokeWidth,
          backgroundColor: 'transparent',
          opacity,
        }}
      />
    );
  }
  if (type === 'ellipse') {
    return (
      <div
        className="absolute pointer-events-none"
        style={{
          left: preview.x,
          top: preview.y,
          width: preview.width,
          height: preview.height,
          border: `${strokeWidth}px solid ${color}`,
          borderRadius: '50%',
          backgroundColor: 'transparent',
          opacity,
        }}
      />
    );
  }
  if (type === 'line' || type === 'arrow') {
    return (
      <svg
        className="absolute inset-0 pointer-events-none"
        style={{ overflow: 'visible' }}
      >
        <defs>
          <marker
            id={`arrowhead-${type}`}
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill={color} />
          </marker>
        </defs>
        <line
          x1={preview.x}
          y1={preview.y}
          x2={preview.x + preview.width}
          y2={preview.y + preview.height}
          stroke={color}
          strokeWidth={strokeWidth}
          markerEnd={type === 'arrow' ? `url(#arrowhead-${type})` : undefined}
        />
      </svg>
    );
  }
  return null;
}

// ── ZustandAnnotationView ──────────────────────────────────────
function ZustandAnnotationView({
  annotation,
  isEditing,
  onStickyEdit,
  onCommentEdit,
  commentInput,
  onCommentInputChange,
  activeCommentId,
  onCommentPopoverClose,
  pageAnnotations,
}: {
  annotation: ZustandAnnotation;
  isEditing: boolean;
  onStickyEdit: (content: string) => void;
  onCommentEdit: (content: string) => void;
  commentInput: string;
  onCommentInputChange: (v: string) => void;
  activeCommentId: string | null;
  onCommentPopoverClose: () => void;
  pageAnnotations: ZustandAnnotation[];
}) {
  const [stickyText, setStickyText] = useState('');

  if (annotation.type === 'highlight') {
    return (
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundColor: annotation.color,
          opacity: annotation.opacity * 0.35,
        }}
      />
    );
  }

  if (annotation.type === 'underline') {
    return (
      <div
        className="absolute bottom-0 left-0 right-0 h-0.5 pointer-events-none"
        style={{ backgroundColor: annotation.color }}
      />
    );
  }

  if (annotation.type === 'strikethrough') {
    return (
      <div
        className="absolute top-1/2 left-0 right-0 h-0.5 pointer-events-none -translate-y-1/2"
        style={{ backgroundColor: annotation.color }}
      />
    );
  }

  if (annotation.type === 'sticky') {
    if (isEditing) {
      return (
        <textarea
          className="w-full h-full p-2 rounded shadow text-xs resize-none bg-yellow-100 border-2 border-yellow-400"
          value={stickyText}
          onChange={(e) => setStickyText(e.target.value)}
          onBlur={() => {
            onStickyEdit(stickyText);
            setStickyText('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setStickyText('');
              onStickyEdit('');
            }
          }}
          autoFocus
          placeholder="Add note..."
        />
      );
    }
    return (
      <div
        className="w-full h-full p-2 rounded shadow text-xs overflow-hidden"
        style={{ backgroundColor: annotation.color, color: '#92400e' }}
      >
        {annotation.content || 'Double-click to edit'}
      </div>
    );
  }

  if (annotation.type === 'comment') {
    const commentNumber = pageAnnotations
      .filter((a) => a.type === 'comment')
      .findIndex((a) => a.id === annotation.id) + 1;
    const isActive = activeCommentId === annotation.id;

    return (
      <div className="relative">
        {/* Pin icon */}
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-2xs font-bold shadow-md"
          style={{ backgroundColor: annotation.color }}
        >
          {commentNumber}
        </div>
        {/* Comment popover */}
        {isActive && (
          <div
            className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-xl border border-border z-50 p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-2xs text-text-tertiary mb-1">{annotation.author}</div>
            {isEditing ? (
              <>
                <textarea
                  className="w-full text-sm border border-border rounded p-1 resize-none"
                  value={commentInput}
                  onChange={(e) => onCommentInputChange(e.target.value)}
                  rows={3}
                  autoFocus
                  placeholder="Add comment..."
                />
                <div className="flex gap-1 mt-1">
                  <button
                    className="px-2 py-0.5 text-2xs bg-accent text-white rounded"
                    onClick={() => {
                      onCommentEdit(commentInput);
                      onCommentPopoverClose();
                    }}
                  >
                    Save
                  </button>
                  <button
                    className="px-2 py-0.5 text-2xs border border-border rounded"
                    onClick={() => {
                      onCommentPopoverClose();
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-sm text-text-primary">{annotation.content || 'No comment'}</div>
                <div className="text-2xs text-text-tertiary mt-1">
                  {new Date(annotation.timestamp).toLocaleString()}
                </div>
                <button
                  className="mt-2 text-2xs text-accent hover:underline"
                  onClick={() => {
                    setStickyText(annotation.content);
                    // Use a different approach to edit
                    onCommentEdit(''); // will be handled by parent
                  }}
                >
                  Reply
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  if (annotation.type === 'drawing') {
    return (
      <img
        src={annotation.imageData}
        className="absolute inset-0 pointer-events-none"
        style={{ width: annotation.width, height: annotation.height }}
        alt="drawing"
      />
    );
  }

  if (annotation.type === 'rectangle') {
    return (
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          border: `${annotation.strokeWidth}px solid ${annotation.color}`,
          backgroundColor: (annotation as any).filled ? annotation.color + '40' : 'transparent',
          opacity: annotation.opacity,
        }}
      />
    );
  }

  if (annotation.type === 'ellipse') {
    return (
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          border: `${annotation.strokeWidth}px solid ${annotation.color}`,
          borderRadius: '50%',
          backgroundColor: (annotation as any).filled ? annotation.color + '40' : 'transparent',
          opacity: annotation.opacity,
        }}
      />
    );
  }

  if (annotation.type === 'arrow' || annotation.type === 'line') {
    const isArrow = annotation.type === 'arrow';
    return (
      <svg
        className="absolute inset-0 pointer-events-none"
        style={{ overflow: 'visible' }}
      >
        <defs>
          <marker
            id={`arrow-${annotation.id}`}
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill={annotation.color} />
          </marker>
        </defs>
        <line
          x1={annotation.x}
          y1={annotation.y}
          x2={annotation.x + annotation.width}
          y2={annotation.y + annotation.height}
          stroke={annotation.color}
          strokeWidth={annotation.strokeWidth}
          markerEnd={isArrow ? `url(#arrow-${annotation.id})` : undefined}
        />
      </svg>
    );
  }

  return null;
}

// ── AnnotationView (pdf-engine) ─────────────────────────────────
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

// ── Helpers ────────────────────────────────────────────────────
function isPointInRect(
  point: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function getBoundingBoxOfPoints(points: Array<{ x: number; y: number }>): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
