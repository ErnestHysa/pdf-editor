'use client';
import { useEffect, useRef, useCallback, useState, memo } from 'react';
import { Page } from '@pagecraft/pdf-engine';
import { useDocumentStore } from '@/stores/documentStore';
import { useToolStore } from '@/stores/toolStore';
import { useHistoryStore } from '@/stores/historyStore';
import { TextEditOverlay } from './TextEditOverlay';
import { SelectionHandles } from './SelectionHandles';
import { ShapePreview } from './ShapePreview';
import { ZustandAnnotationView } from './ZustandAnnotationView';
import { cn } from '@/lib/utils';

interface PageCanvasProps {
  page: Page;
  pageIndex: number;
  isActive: boolean;
  onPageClick: () => void;
  zoom: number;
  isGesturing?: boolean;
  onLongPress?: (x: number, y: number) => void;
}

// ── PageCanvas ────────────────────────────────────────────────────
// Full canvas rendering for a single PDF page: pdf.js canvas,
// text/image/annotation overlays, drawing tools, selection handles.
// memoized so it only re-renders when its page or selection changes.
export const PageCanvas = memo(function PageCanvas({
  page,
  pageIndex,
  isActive,
  onPageClick,
  zoom,
  isGesturing = false,
  onLongPress,
}: PageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawCanvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  const {
    textObjects, selectedObjects, selectObject, clearSelection,
    setDirty, annotations, addAnnotation, removeAnnotation,
    updateAnnotation, imageObjects, updateImageObject, addImageObject,
  } = useDocumentStore();
  const { activeTool, toolOptions } = useToolStore();

  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [isDrawingStroke, setIsDrawingStroke] = useState(false);
  const [shapePreview, setShapePreview] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [shapeStartPos, setShapeStartPos] = useState<{ x: number; y: number } | null>(null);
  const [editingStickyId, setEditingStickyId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);

  const drawingPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const renderScale = zoom;

  // ── Long-press detection refs ──────────────────────────────────────
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const LONG_PRESS_DURATION = 500;
  const MOVE_THRESHOLD = 10;

  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const pageObjects = page.getObjects();
  const pageTextObjects = textObjects.filter((o) => o.pageIndex === pageIndex);
  const pageAnnotations = annotations.filter((a) => a.pageIndex === pageIndex);
  const pageSelected = selectedObjects.filter((o) => o.pageIndex === pageIndex);

  // ── pdf.js canvas rendering ──────────────────────────────────────
  const { pdfJsDoc } = useDocumentStore();
  useEffect(() => {
    if (!canvasRef.current || !pdfJsDoc) return;
    let cancelled = false;
    (async () => {
      const pdfPage = await pdfJsDoc.getPage(pageIndex + 1);
      if (cancelled) return;
      const viewport = pdfPage.getViewport({ scale: renderScale });
      const canvas = canvasRef.current!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      await pdfPage.render({ canvasContext: ctx, viewport }).promise;
    })();
    return () => { cancelled = true; };
  }, [pdfJsDoc, pageIndex, renderScale]);

  // ── Drawing canvas overlay setup ─────────────────────────────────
  useEffect(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    canvas.width = pageWidth * renderScale;
    canvas.height = pageHeight * renderScale;
    drawCanvasCtxRef.current = canvas.getContext('2d');
  }, [pageWidth, pageHeight, renderScale]);

  // ── Draw freehand strokes when annotations change ─────────────────
  useEffect(() => {
    const canvas = drawCanvasRef.current;
    const ctx = drawCanvasCtxRef.current;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const drawingAnnotations = annotations.filter(
      (a) => a.type === 'drawing' && a.pageIndex === pageIndex
    );
    for (const ann of drawingAnnotations) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, ann.x * renderScale, ann.y * renderScale,
          ann.width * renderScale, ann.height * renderScale);
      };
      img.src = (ann as any).imageData ?? '';
    }
  }, [annotations, pageIndex, renderScale]);

  // ── Coordinate helpers ───────────────────────────────────────────
  const getPointerPosition = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (e.clientX - rect.left) / renderScale,
      y: (e.clientY - rect.top) / renderScale,
    };
  }, [renderScale]);

  // ── Pointer event handlers ────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;

    // Skip annotation creation during 2-finger pinch gestures
    if (isGesturing) return;

    const pos = getPointerPosition(e);
    setShapeStartPos(pos);

    // Start long-press timer for sticky/comment tools
    if (activeTool === 'sticky' || activeTool === 'comment') {
      touchStartRef.current = pos;
      longPressTimerRef.current = setTimeout(() => {
        // Long-press without movement: show context menu instead of creating annotation
        if (onLongPress) {
          onLongPress(pos.x, pos.y);
        }
        touchStartRef.current = null;
      }, LONG_PRESS_DURATION);
    }

    if (activeTool === 'draw') {
      const ctx = drawCanvasCtxRef.current;
      if (!ctx) return;
      setIsDrawingStroke(true);
      drawingPointsRef.current = [pos];
      ctx.beginPath();
      ctx.moveTo(pos.x * renderScale, pos.y * renderScale);
      return;
    }

    if (activeTool === 'sticky') {
      const id = `sticky-${pageIndex}-${Date.now()}`;
      const newSticky: any = {
        id, type: 'sticky', pageIndex,
        x: pos.x - 60, y: pos.y - 30, width: 120, height: 80,
        color: toolOptions.color, opacity: 1,
        content: '',
      };
      useHistoryStore.getState().push({
        label: 'Add sticky note', description: 'Add sticky note',
        targetIds: [id],
        undo: () => useDocumentStore.getState().removeAnnotation(id),
        redo: () => useDocumentStore.getState().addAnnotation(newSticky),
      });
      addAnnotation(newSticky);
      setDirty(true);
      return;
    }

    if (activeTool === 'comment') {
      const id = `comment-${pageIndex}-${Date.now()}`;
      const newComment: any = {
        id, type: 'comment', pageIndex,
        x: pos.x - 12, y: pos.y - 12, width: 24, height: 24,
        color: toolOptions.color, opacity: 1,
        content: '', author: 'You', timestamp: Date.now(),
      };
      useHistoryStore.getState().push({
        label: 'Add comment', description: 'Add comment',
        targetIds: [id],
        undo: () => useDocumentStore.getState().removeAnnotation(id),
        redo: () => useDocumentStore.getState().addAnnotation(newComment),
      });
      addAnnotation(newComment);
      setDirty(true);
      return;
    }

    if (['highlight', 'underline', 'strikethrough'].includes(activeTool)) {
      const id = `mark-${pageIndex}-${Date.now()}`;
      const newMark: any = {
        id, type: activeTool as 'highlight' | 'underline' | 'strikethrough',
        pageIndex, x: pos.x, y: pos.y, width: 100, height: 16,
        color: toolOptions.color, opacity: toolOptions.opacity,
      };
      useHistoryStore.getState().push({
        label: `Add ${activeTool}`, description: `Add ${activeTool}`,
        targetIds: [id],
        undo: () => useDocumentStore.getState().removeAnnotation(id),
        redo: () => useDocumentStore.getState().addAnnotation(newMark),
      });
      addAnnotation(newMark);
      setDirty(true);
      return;
    }

    if (activeTool === 'text') {
      const id = `text-${pageIndex}-${Date.now()}`;
      const newObj = {
        id, pageIndex,
        x: pos.x, y: pos.y, width: 200, height: 28,
        content: 'New text', fontSize: toolOptions.fontSize ?? 14,
        fontFamily: toolOptions.fontFamily ?? 'DM Sans',
        fontWeight: toolOptions.fontWeight ?? 'normal',
        fontStyle: toolOptions.fontStyle ?? 'normal',
        textAlign: toolOptions.textAlign ?? 'left',
        color: toolOptions.textColor ?? '#F0EDE8',
        rotation: 0, objectRef: 'new',
      };
      useHistoryStore.getState().push({
        label: 'Add text', description: 'Add text',
        targetIds: [id],
        undo: () => useDocumentStore.getState().removeTextObject(id),
        redo: () => useDocumentStore.getState().addTextObject(newObj),
      });
      useDocumentStore.getState().addTextObject(newObj);
      setDirty(true);
      setEditingTextId(id);
      return;
    }

    if (activeTool === 'image') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (ev) => {
        const file = (ev.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (re) => {
          const src = re.target?.result as string;
          const id = `img-${Date.now()}`;
          const newObj = { id, pageIndex, x: pos.x, y: pos.y, width: 200, height: 150, src, opacity: 1, rotation: 0 };
          useHistoryStore.getState().push({
            label: 'Add image', description: 'Add image',
            targetIds: [id],
            undo: () => useDocumentStore.getState().removeImageObject(id),
            redo: () => useDocumentStore.getState().addImageObject(newObj),
          });
          addImageObject(newObj);
          setDirty(true);
        };
        reader.readAsDataURL(file);
      };
      input.click();
      return;
    }

    if (['rectangle', 'ellipse', 'line', 'arrow'].includes(activeTool)) {
      setShapePreview({ x: pos.x, y: pos.y, width: 0, height: 0 });
    }
  }, [activeTool, pageIndex, toolOptions, renderScale, getPointerPosition, isGesturing, onLongPress]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!shapeStartPos) return;
    const pos = getPointerPosition(e);

    // Cancel long-press if finger moved beyond threshold
    if (touchStartRef.current && longPressTimerRef.current) {
      const dx = Math.abs(pos.x - touchStartRef.current.x);
      const dy = Math.abs(pos.y - touchStartRef.current.y);
      if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
        touchStartRef.current = null;
      }
    }

    if (activeTool === 'draw' && isDrawingStroke) {
      const ctx = drawCanvasCtxRef.current;
      if (!ctx) return;
      ctx.lineTo(pos.x * renderScale, pos.y * renderScale);
      ctx.stroke();
      drawingPointsRef.current.push(pos);
    }

    if (['rectangle', 'ellipse', 'line', 'arrow'].includes(activeTool)) {
      setShapePreview({
        x: Math.min(pos.x, shapeStartPos.x),
        y: Math.min(pos.y, shapeStartPos.y),
        width: Math.abs(pos.x - shapeStartPos.x),
        height: Math.abs(pos.y - shapeStartPos.y),
      });
    }
  }, [activeTool, isDrawingStroke, shapeStartPos, renderScale, getPointerPosition]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Clear long-press timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartRef.current = null;

    const pos = getPointerPosition(e);

    if (activeTool === 'draw' && isDrawingStroke) {
      setIsDrawingStroke(false);
      const canvas = drawCanvasRef.current;
      if (!canvas) return;
      const imageData = canvas.toDataURL('image/png');
      const id = `drawing-${pageIndex}-${Date.now()}`;
      const bounds = getBoundingBoxOfPoints(drawingPointsRef.current);
      const newAnnotation: any = {
        id, type: 'drawing', pageIndex,
        x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
        color: toolOptions.color, opacity: toolOptions.opacity,
        imageData,
      };
      useHistoryStore.getState().push({
        label: 'Draw stroke', description: 'Draw stroke',
        targetIds: [id],
        undo: () => useDocumentStore.getState().removeAnnotation(id),
        redo: () => useDocumentStore.getState().addAnnotation(newAnnotation),
      });
      addAnnotation(newAnnotation);
      drawingPointsRef.current = [];
      const ctx = drawCanvasCtxRef.current;
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      setDirty(true);
      return;
    }

    if (['rectangle', 'ellipse', 'line', 'arrow'].includes(activeTool) && shapePreview) {
      const id = `${activeTool}-${pageIndex}-${Date.now()}`;
      const newAnn: any = {
        id, type: activeTool as 'rectangle' | 'ellipse' | 'line' | 'arrow',
        pageIndex,
        x: shapePreview.x, y: shapePreview.y,
        width: shapePreview.width, height: shapePreview.height,
        color: toolOptions.color, opacity: toolOptions.opacity,
        strokeWidth: toolOptions.strokeWidth ?? 2,
      };
      useHistoryStore.getState().push({
        label: `Add ${activeTool}`, description: `Add ${activeTool}`,
        targetIds: [id],
        undo: () => useDocumentStore.getState().removeAnnotation(id),
        redo: () => useDocumentStore.getState().addAnnotation(newAnn),
      });
      addAnnotation(newAnn);
      setShapePreview(null);
      setShapeStartPos(null);
      setDirty(true);
    }
  }, [activeTool, pageIndex, toolOptions, shapePreview, isDrawingStroke, renderScale, getPointerPosition]);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pos = {
      x: (e.clientX - rect.left) / renderScale,
      y: (e.clientY - rect.top) / renderScale,
    };

    for (const textObj of pageTextObjects) {
      if (
        pos.x >= textObj.x && pos.x <= textObj.x + textObj.width &&
        pos.y >= textObj.y && pos.y <= textObj.y + textObj.height
      ) {
        setEditingTextId(textObj.id);
        return;
      }
    }
    for (const ann of pageAnnotations) {
      if (
        pos.x >= ann.x && pos.x <= ann.x + ann.width &&
        pos.y >= ann.y && pos.y <= ann.y + ann.height &&
        (ann.type === 'sticky' || ann.type === 'comment')
      ) {
        if (ann.type === 'sticky') setEditingStickyId(ann.id);
        if (ann.type === 'comment') setActiveCommentId(ann.id);
        return;
      }
    }
  }, [pageTextObjects, pageAnnotations, renderScale]);

  // ── JSX render ────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className={cn(
        'relative page-shadow',
        isActive && 'ring-2 ring-accent',
      )}
      style={{ width: pageWidth, height: pageHeight }}
      onClick={(e) => {
        if (e.target === containerRef.current) {
          onPageClick();
          if (activeTool === 'select') clearSelection();
        }
      }}
      onDoubleClick={handleDoubleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* pdf.js rendered page */}
      <canvas ref={canvasRef} className="absolute inset-0" style={{ width: pageWidth, height: pageHeight }} />

      {/* Drawing overlay canvas */}
      <canvas
        ref={drawCanvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ width: pageWidth, height: pageHeight }}
      />

      {/* Shape preview while drawing */}
      {shapePreview && (
        <ShapePreview
          type={activeTool as any}
          preview={shapePreview}
          color={toolOptions.color}
          strokeWidth={toolOptions.strokeWidth ?? 2}
          opacity={toolOptions.opacity}
        />
      )}

      {/* Text object overlays */}
      {pageTextObjects.map((textObj) => {
        const isCurrentlySelected = pageSelected.some((o) => o.id === textObj.id);
        return (
          <div
            key={textObj.id}
            className="absolute cursor-text"
            style={{
              left: textObj.x, top: textObj.y,
              width: textObj.width, height: textObj.height,
            }}
            onClick={(e) => {
              e.stopPropagation();
              selectObject({ id: textObj.id, type: 'text', pageIndex });
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditingTextId(textObj.id);
            }}
          >
            {isCurrentlySelected && (
              <SelectionHandles
                bbox={{ x: textObj.x, y: textObj.y, width: textObj.width, height: textObj.height, rotation: textObj.rotation ?? 0 }}
                onResize={(handle, dx, dy) => {
                  let nx = textObj.x, ny = textObj.y, nw = textObj.width, nh = textObj.height;
                  if (handle === 'nw') { nx += dx; ny += dy; nw -= dx; nh -= dy; }
                  else if (handle === 'ne') { ny += dy; nw += dx; nh -= dy; }
                  else if (handle === 'se') { nw += dx; nh += dy; }
                  else if (handle === 'sw') { nx += dx; nw -= dx; nh += dy; }
                  else if (handle === 'n') { ny += dy; nh -= dy; }
                  else if (handle === 's') { nh += dy; }
                  else if (handle === 'e') { nw += dx; }
                  else if (handle === 'w') { nx += dx; nw -= dx; }
                  if (nw > 10 && nh > 10) {
                    useDocumentStore.getState().updateTextObject(textObj.id, { x: nx, y: ny, width: nw, height: nh });
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
            {/* Rotation wrapper for text content */}
            <div
              className="absolute inset-0"
              style={{ transform: `rotate(${textObj.rotation ?? 0}deg)` }}
            >
              {editingTextId === textObj.id ? (
                <TextEditOverlay
                  textObject={textObj}
                  onClose={() => setEditingTextId(null)}
                  onSave={(newContent) => {
                    const oldContent = textObj.content;
                    useHistoryStore.getState().push({
                      label: 'Edit text', description: 'Edit text',
                      targetIds: [textObj.id],
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
          </div>
        );
      })}

      {/* Image overlays — pdf-engine ImageObject instances */}
      {pageObjects.images.map((imgObj: any) => {
        const bbox = imgObj.getBBox();
        const isImgSelected = pageSelected.some((o) => o.id === imgObj.getId());
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
              selectObject({ id: imgObj.getId(), type: 'image', pageIndex });
            }}
          >
            {isImgSelected && (
              <SelectionHandles
                bbox={bbox}
                onResize={(handle, dx, dy) => {
                  let nx = bbox.x, ny = bbox.y, nw = bbox.width, nh = bbox.height;
                  if (handle === 'nw') { nx += dx; ny += dy; nw -= dx; nh -= dy; }
                  else if (handle === 'ne') { ny += dy; nw += dx; nh -= dy; }
                  else if (handle === 'se') { nw += dx; nh += dy; }
                  else if (handle === 'sw') { nx += dx; nw -= dx; nh += dy; }
                  else if (handle === 'n') { ny += dy; nh -= dy; }
                  else if (handle === 's') { nh += dy; }
                  else if (handle === 'e') { nw += dx; }
                  else if (handle === 'w') { nx += dx; nw -= dx; }
                  if (nw > 10 && nh > 10) {
                    imgObj.setBBox({ x: nx, y: ny, width: nw, height: nh });
                    setDirty(true);
                  }
                }}
                onRotateStart={() => {}}
                onRotateMove={(deg) => { imgObj.setRotation(deg); setDirty(true); }}
              />
            )}
            <img src={imgObj.getSrc?.() ?? ''} className="w-full h-full object-cover pointer-events-none" draggable={false} alt="" />
          </div>
        );
      })}

      {/* Zustand ImageObject overlays — user-added images */}
      {imageObjects.filter((img) => img.pageIndex === pageIndex).map((imgObj) => {
        const isImgSelected = pageSelected.some((o) => o.id === imgObj.id);
        return (
          <div
            key={imgObj.id}
            className="absolute cursor-move"
            style={{
              left: imgObj.x, top: imgObj.y,
              width: imgObj.width, height: imgObj.height,
              transform: `rotate(${imgObj.rotation}deg)`,
              opacity: imgObj.opacity ?? 1,
            }}
            onClick={(e) => {
              e.stopPropagation();
              selectObject({ id: imgObj.id, type: 'image', pageIndex });
            }}
          >
            {isImgSelected && (
              <SelectionHandles
                bbox={{ x: imgObj.x, y: imgObj.y, width: imgObj.width, height: imgObj.height, rotation: imgObj.rotation }}
                onResize={(handle, dx, dy) => {
                  let nx = imgObj.x, ny = imgObj.y, nw = imgObj.width, nh = imgObj.height;
                  if (handle === 'nw') { nx += dx; ny += dy; nw -= dx; nh -= dy; }
                  else if (handle === 'ne') { ny += dy; nw += dx; nh -= dy; }
                  else if (handle === 'se') { nw += dx; nh += dy; }
                  else if (handle === 'sw') { nx += dx; nw -= dx; nh += dy; }
                  else if (handle === 'n') { ny += dy; nh -= dy; }
                  else if (handle === 's') { nh += dy; }
                  else if (handle === 'e') { nw += dx; }
                  else if (handle === 'w') { nx += dx; nw -= dx; }
                  if (nw > 10 && nh > 10) updateImageObject(imgObj.id, { x: nx, y: ny, width: nw, height: nh });
                }}
                onRotateStart={() => {}}
                onRotateMove={(deg) => updateImageObject(imgObj.id, { rotation: deg })}
              />
            )}
            <img src={imgObj.src} className="w-full h-full object-contain pointer-events-none" draggable={false} alt="" />
          </div>
        );
      })}

      {/* Zustand Annotation overlays */}
      {pageAnnotations.map((ann) => {
        const isAnnSelected = pageSelected.some((o) => o.id === ann.id);
        return (
          <div
            key={ann.id}
            className="absolute cursor-pointer"
            style={{ left: ann.x, top: ann.y, width: ann.width, height: ann.height, zIndex: 20 }}
            onClick={(e) => {
              e.stopPropagation();
              selectObject({ id: ann.id, type: 'annotation', pageIndex });
              if (ann.type === 'comment') setActiveCommentId(ann.id === activeCommentId ? null : ann.id);
            }}
          >
            {isAnnSelected && (
              <SelectionHandles
                bbox={{ x: ann.x, y: ann.y, width: ann.width, height: ann.height, rotation: 0 }}
                onResize={(handle, dx, dy) => {
                  let nx = ann.x, ny = ann.y, nw = ann.width, nh = ann.height;
                  if (handle === 'nw') { nx += dx; ny += dy; nw -= dx; nh -= dy; }
                  else if (handle === 'ne') { ny += dy; nw += dx; nh -= dy; }
                  else if (handle === 'se') { nw += dx; nh += dy; }
                  else if (handle === 'sw') { nx += dx; nw -= dx; nh += dy; }
                  else if (handle === 'n') { ny += dy; nh -= dy; }
                  else if (handle === 's') { nh += dy; }
                  else if (handle === 'e') { nw += dx; }
                  else if (handle === 'w') { nx += dx; nw -= dx; }
                  if (nw > 10 && nh > 10) updateAnnotation(ann.id, { x: nx, y: ny, width: nw, height: nh } as any);
                }}
                onRotateStart={() => {}}
                onRotateMove={() => {}}
              />
            )}
            <ZustandAnnotationView
              annotation={ann}
              isEditing={editingStickyId === ann.id || editingCommentId === ann.id}
              onStickyEdit={(content) => { updateAnnotation(ann.id, { content } as any); setEditingStickyId(null); }}
              onCommentEdit={(content) => { updateAnnotation(ann.id, { content } as any); setEditingCommentId(null); }}
              commentInput={commentInput}
              onCommentInputChange={setCommentInput}
              activeCommentId={activeCommentId}
              onCommentPopoverClose={() => setActiveCommentId(null)}
              pageAnnotations={pageAnnotations}
            />
          </div>
        );
      })}
    </div>
  );
});

// ── Helpers ────────────────────────────────────────────────────────
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
  x: number; y: number; width: number; height: number;
} {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    x: Math.min(...xs), y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

// re-export the Zustand helper types for convenience
import type { SerializableTextObject } from '@/stores/documentStore';
