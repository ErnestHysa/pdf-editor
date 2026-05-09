'use client';
import { useEffect, useRef, useCallback, useState, memo } from 'react';
import { Page } from '@pagecraft/pdf-engine';
import { useDocumentStore, DocumentState } from '@/stores/documentStore';
import { useUIStore } from '@/stores/uiStore';
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

// ── Viewport culling ──────────────────────────────────────────────
// Returns true if two rects intersect (in page coordinates)
function rectsIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
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

  const textObjects = useDocumentStore(useCallback((s: DocumentState) => 
    s.textObjects.filter(o => o.pageIndex === pageIndex), [pageIndex]));
  const imageObjects = useDocumentStore(useCallback((s: DocumentState) => 
    s.imageObjects.filter(o => o.pageIndex === pageIndex), [pageIndex]));
  const annotations = useDocumentStore(useCallback((s: DocumentState) => 
    s.annotations.filter(a => a.pageIndex === pageIndex), [pageIndex]));
  const { activeTool, toolOptions } = useToolStore();
  const selectedObjects = useDocumentStore((s) => s.selectedObjects);
  const addAnnotation = useDocumentStore((s) => s.addAnnotation);
  const removeAnnotation = useDocumentStore((s) => s.removeAnnotation);
  const updateAnnotation = useDocumentStore((s) => s.updateAnnotation);
  const updateImageObject = useDocumentStore((s) => s.updateImageObject);
  const addImageObject = useDocumentStore((s) => s.addImageObject);
  const selectObject = useDocumentStore((s) => s.selectObject);
  const clearSelection = useDocumentStore((s) => s.clearSelection);
  const setDirty = useDocumentStore((s) => s.setDirty);
  const searchActiveMatches = useDocumentStore((s) => s.searchActiveMatches);
  const searchCurrentMatchIndex = useDocumentStore((s) => s.searchCurrentMatchIndex);

  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [isDrawingStroke, setIsDrawingStroke] = useState(false);
  const [shapePreview, setShapePreview] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [shapeStartPos, setShapeStartPos] = useState<{ x: number; y: number } | null>(null);
  const [editingStickyId, setEditingStickyId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [viewportRect, setViewportRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const { panOffset } = useUIStore();

  const drawingPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const cancelledRef = useRef(false);
  const renderScale = zoom;

  // ── Viewport culling: compute visible rect from scroll container ─
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateViewport = () => {
      const scrollEl = container.parentElement;
      if (!scrollEl) return;
      const scrollTop = scrollEl.scrollTop;
      const scrollLeft = scrollEl.scrollLeft;
      const clientWidth = scrollEl.clientWidth;
      const clientHeight = scrollEl.clientHeight;
      // Convert screen coords to page coords by subtracting panOffset and dividing by zoom
      const visX = (scrollLeft - panOffset.x) / zoom;
      const visY = (scrollTop - panOffset.y) / zoom;
      const visW = clientWidth / zoom;
      const visH = clientHeight / zoom;
      setViewportRect({ x: visX, y: visY, width: visW, height: visH });
    };

    updateViewport();

    const scrollEl = container.parentElement;
    if (!scrollEl) return;
    scrollEl.addEventListener('scroll', updateViewport, { passive: true });
    window.addEventListener('resize', updateViewport, { passive: true });
    return () => {
      scrollEl.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
    };
  }, [zoom, panOffset]);

  // Returns true if an object at (objX, objY) with size (objW, objH) is visible
  const isObjectVisible = useCallback(
    (objX: number, objY: number, objW: number, objH: number) => {
      if (!viewportRect) return true; // default to visible if viewport not yet known
      return rectsIntersect(
        { x: objX, y: objY, width: objW, height: objH },
        viewportRect
      );
    },
    [viewportRect]
  );

  // ── Long-press detection refs ──────────────────────────────────────
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const LONG_PRESS_DURATION = 500;
  const MOVE_THRESHOLD = 10;

  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const pageObjects = page.getObjects();
  // textObjects, imageObjects, annotations are already filtered per pageIndex at subscription time
  const pageTextObjects = textObjects as SerializableTextObject[];
  const pageAnnotations = annotations;
  const pageSelected = selectedObjects.filter((o: { pageIndex: number }) => o.pageIndex === pageIndex);

  // ── pdf.js canvas rendering ──────────────────────────────────────
  const { pdfJsDoc, targetedReloads } = useDocumentStore();
  const [pageReloadKey, setPageReloadKey] = useState(0);

  // Re-render this specific page when targetedReloads[pageIndex] changes
  useEffect(() => {
    const ts = targetedReloads[pageIndex];
    if (ts) setPageReloadKey((k) => k + 1);
  }, [targetedReloads, pageIndex]);

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
    return () => {
      cancelled = true;
      // Explicit canvas cleanup to avoid memory leaks on large PDFs (#21)
      if (canvasRef.current) {
        canvasRef.current.width = 0;
        canvasRef.current.height = 0;
      }
    };
    // pageReloadKey is intentionally omitted — we re-render via targetedReloads effect above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfJsDoc, pageIndex, renderScale, pageReloadKey]);

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
    cancelledRef.current = false;
    const canvas = drawCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    drawCanvasCtxRef.current = ctx;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const drawingAnnotations = annotations.filter(
      (a: { type: string; pageIndex: number }) => a.type === 'drawing' && a.pageIndex === pageIndex
    );
    for (const ann of drawingAnnotations) {
      const img = new Image();
      img.onload = () => {
        if (cancelledRef.current || !drawCanvasCtxRef.current) return;
        drawCanvasCtxRef.current.drawImage(img, ann.x * renderScale, ann.y * renderScale,
          ann.width * renderScale, ann.height * renderScale);
      };
      img.src = (ann as any).imageData ?? '';
    }
    return () => {
      cancelledRef.current = true;
    };
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
        label: 'Add sticky note',
        targetIds: [id],
        type: 'annotation-add',
        objectData: newSticky,
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
        label: 'Add comment',
        targetIds: [id],
        type: 'annotation-add',
        objectData: newComment,
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
        label: `Add ${activeTool}`,
        targetIds: [id],
        type: 'annotation-add',
        objectData: newMark,
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
        color: toolOptions.textColor ?? '#000000',
        rotation: 0, objectRef: 'new',
      };
      useHistoryStore.getState().push({
        label: 'Add text',
        targetIds: [id],
        type: 'text-add',
        objectData: newObj,
      });
      useDocumentStore.getState().addTextObject(newObj);
      setDirty(true);
      setEditingTextId(id);
      return;
    }

    if (activeTool === 'image') {
      // Guard: only open file dialog once per tool activation, not on every pointer down
      if ((e.target as HTMLElement).closest('[data-image-guard]')) return;
      const input = document.createElement('input');
      input.setAttribute('data-image-guard', 'true');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (ev) => {
        const file = (ev.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (re) => {
          const src = re.target?.result as string;
          const id = `img-${Date.now()}`;
          const newObj = { id, pageIndex, x: pos.x, y: pos.y, width: 200, height: 150, src, opacity: 1, rotation: 0, objectRef: '' };
          useHistoryStore.getState().push({
            label: 'Add image',
            targetIds: [id],
            type: 'image-add',
            objectData: newObj,
          });
          addImageObject(newObj);
          setDirty(true);
        };
        reader.readAsDataURL(file);
      };
      input.click();
      return;
    }

    if (activeTool === 'signature') {
      const { pendingSignature } = useDocumentStore.getState();
      if (!pendingSignature) {
        useUIStore.getState().setToast('No signature pending — draw or upload one first');
        return;
      }
        const { dataUrl, width, height } = pendingSignature;
        const id = `sig-${Date.now()}`;
        // Scale signature to a reasonable display width (max 200pt wide)
        const maxWidth = 200;
        const scale = width > maxWidth ? maxWidth / width : 1;
        const displayWidth = width * scale;
        const displayHeight = height * scale;
        const newObj = {
          id, pageIndex,
          x: pos.x - displayWidth / 2,
          y: pos.y - displayHeight / 2,
          width: displayWidth, height: displayHeight,
          src: dataUrl, opacity: 1, rotation: 0,
        };
        useHistoryStore.getState().push({
          label: 'Add signature',
          targetIds: [id],
          type: 'image-add',
          objectData: newObj,
        });
        addImageObject(newObj);
        useDocumentStore.getState().setPendingSignature(null);
        useToolStore.getState().setTool('select');
        setDirty(true);
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
        label: 'Draw stroke',
        targetIds: [id],
        type: 'annotation-add',
        objectData: newAnnotation,
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
        label: `Add ${activeTool}`,
        targetIds: [id],
        type: 'annotation-add',
        objectData: newAnn,
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
      {pageTextObjects
        .filter((textObj: { x: number; y: number; width: number; height: number }) => isObjectVisible(textObj.x, textObj.y, textObj.width, textObj.height))
        .map((textObj) => {
        const isCurrentlySelected = pageSelected.some((o: { id: string }) => o.id === textObj.id);
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
            <div
              className="absolute inset-0"
              style={{ transform: `rotate(${textObj.rotation ?? 0}deg)` }}
            >
              {(() => {
                const activeMatch = searchActiveMatches.find(
                  (m: { textObjectId: string }) => m.textObjectId === textObj.id
                );
                if (!activeMatch) return null;
                return (
                  <div
                    className="absolute pointer-events-none search-match-highlight"
                    style={{
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                    }}
                  />
                );
              })()}
              {/* Render text content with highlight for matched substring */}
              {editingTextId === textObj.id ? (
                <TextEditOverlay
                  textObject={textObj}
                  onClose={() => setEditingTextId(null)}
                  onSave={(newContent) => {
                    const oldContent = textObj.content;
                    useDocumentStore.getState().updateTextObject(textObj.id, { content: newContent });
                    setDirty(true);
                    setEditingTextId(null);
                  }}
                />
              ) : (
                (() => {
                  const activeMatch = searchActiveMatches.find(
                    (m: { textObjectId: string }) => m.textObjectId === textObj.id
                  );
                  const content = textObj.content;
                  if (activeMatch && activeMatch.matchStart >= 0 && activeMatch.matchEnd <= content.length) {
                    const before = content.slice(0, activeMatch.matchStart);
                    const matched = content.slice(activeMatch.matchStart, activeMatch.matchEnd);
                    const after = content.slice(activeMatch.matchEnd);
                    return (
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
                        {before}
                        <span className="search-match-highlight font-bold">{matched}</span>
                        {after}
                      </span>
                    );
                  }
                  return (
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
                      {content}
                    </span>
                  );
                })()
              )}
              </div>
          </div>
        );
      })}

      {/* Image overlays — pdf-engine ImageObject instances */}
      {(pageObjects?.images ?? [])
        .filter((imgObj: any) => {
          const bbox = imgObj.getBBox();
          return isObjectVisible(bbox.x, bbox.y, bbox.width, bbox.height);
        })
        .map((imgObj: any) => {
        const bbox = imgObj.getBBox();
        const isImgSelected = pageSelected.some((o: { id: string }) => o.id === imgObj.getId());
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
      {imageObjects
        .filter((img: { pageIndex: number; x: number; y: number; width: number; height: number }) => img.pageIndex === pageIndex && isObjectVisible(img.x, img.y, img.width, img.height))
        .map((imgObj: { id: string; x: number; y: number; width: number; height: number; rotation?: number; opacity?: number; src?: string; pageIndex?: number }) => {
        const isImgSelected = pageSelected.some((o: { id: string }) => o.id === imgObj.id);
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
      {pageAnnotations
        .filter((ann: any) => isObjectVisible(ann.x, ann.y, ann.width, ann.height))
        .map((ann: any) => {
        const isAnnSelected = pageSelected.some((o: { id: string }) => o.id === ann.id);
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
  const xs = points.map((p: any) => p.x);
  const ys = points.map((p: any) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  let width = Math.max(...xs) - minX;
  let height = Math.max(...ys) - minY;
  // Ensure minimum 4x4 box for single-point strokes
  if (width < 2 && height < 2) {
    const pt = points[0];
    return { x: pt.x - 2, y: pt.y - 2, width: 4, height: 4 };
  }
  if (width < 2) {
    width = 4;
  }
  if (height < 2) {
    height = 4;
  }
  return { x: minX, y: minY, width, height };
}

// re-export the Zustand helper types for convenience
import type { SerializableTextObject } from '@/stores/documentStore';