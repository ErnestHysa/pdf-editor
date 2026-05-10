'use client';
import { useEffect, useRef, useCallback, useState, useMemo, memo } from 'react';
import { Page } from '@pagecraft/pdf-engine';
import { useDocumentStore } from '@/stores/documentStore';
import { useObjectsStore } from '@/stores/objectsStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useSearchStore } from '@/stores/searchStore';
import { useUIStore } from '@/stores/uiStore';
import { useToolStore } from '@/stores/toolStore';
import { useHistoryStore } from '@/stores/historyStore';
import { PdfPageCanvas } from './PdfPageCanvas';
import { DrawingOverlay } from './DrawingOverlay';
import { ObjectOverlays } from './ObjectOverlays';
import { ShapePreviewOverlay } from './ShapePreviewOverlay';
import { cn } from '@/lib/utils';
import type { SerializableTextObject } from '@/stores/documentStore';

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

// ── Coordinate system note ──────────────────────────────────────
// All coordinates in this component are in PAGE SPACE (top-left origin):
//   - PDF page coordinates: x rightward, y downward (DOM convention)
//   - pdf-lib uses bottom-left origin; conversions happen at export time
//   - Pan/zoom transforms applied at the EditorPage level; PageCanvas operates
//     in untransformed page coordinates
//   - SelectionHandles use page-space coords directly (rotation applied via SVG transforms)

export const PageCanvas = memo(function PageCanvas({
  page,
  pageIndex,
  isActive,
  onPageClick,
  zoom,
  isGesturing = false,
  onLongPress,
}: PageCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const allTextObjects = useObjectsStore((s) => s.textObjects);
  const allImageObjects = useObjectsStore((s) => s.imageObjects);
  const allAnnotations = useObjectsStore((s) => s.annotations);
  const textObjects = useMemo(
    () => allTextObjects.filter(o => o.pageIndex === pageIndex),
    [allTextObjects, pageIndex]
  );
  const imageObjects = useMemo(
    () => allImageObjects.filter(o => o.pageIndex === pageIndex),
    [allImageObjects, pageIndex]
  );
  const annotations = useMemo(
    () => allAnnotations.filter(a => a.pageIndex === pageIndex),
    [allAnnotations, pageIndex]
  );
  const { activeTool, toolOptions } = useToolStore();
  const selectedObjects = useSelectionStore((s) => s.selectedObjects);
  const addAnnotation = useObjectsStore((s) => s.addAnnotation);
  const addImageObject = useObjectsStore((s) => s.addImageObject);
  const selectObject = useSelectionStore((s) => s.selectObject);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const setDirty = useDocumentStore((s) => s.setDirty);

  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [shapePreview, setShapePreview] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [shapeStartPos, setShapeStartPos] = useState<{ x: number; y: number } | null>(null);
  const shapeToolRef = useRef<string | null>(null);
  const [editingStickyId, setEditingStickyId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [viewportRect, setViewportRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const { panOffset } = useUIStore();

  const renderScale = zoom;

  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const pageObjects = page.getObjects();
  const pageTextObjects = textObjects as SerializableTextObject[];
  const pageAnnotations = annotations;
  const pageSelected = selectedObjects.filter((o: { pageIndex: number }) => o.pageIndex === pageIndex);

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

  const isObjectVisible = useCallback(
    (objX: number, objY: number, objW: number, objH: number) => {
      if (!viewportRect) return true;
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

  // ── Coordinate helpers ────────────────────────────────────────────
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
    if (isGesturing) return;

    const pos = getPointerPosition(e);
    setShapeStartPos(pos);

    if (activeTool === 'sticky' || activeTool === 'comment') {
      touchStartRef.current = pos;
      longPressTimerRef.current = setTimeout(() => {
        touchStartRef.current = null;
        const id = `${activeTool}-${pageIndex}-${Date.now()}`;
        if (activeTool === 'sticky') {
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
          if (onLongPress) onLongPress(pos.x, pos.y);
        } else {
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
          if (onLongPress) onLongPress(pos.x, pos.y);
        }
      }, LONG_PRESS_DURATION);
      return;
    }

    // Stamp tool: place stamp annotation on click
    if (activeTool === 'stamp') {
      import('@pagecraft/pdf-engine').then(({ buildStampAnnotation }) => {
        const id = `stamp-${pageIndex}-${Date.now()}`;
        const stamp = buildStampAnnotation(
          pageIndex, pos.x - 60, pos.y - 20,
          toolOptions.stampLabel ?? 'APPROVED',
          toolOptions.stampBackgroundColor ?? '#4CAF7D',
          120, 40
        );
        stamp.id = id;
        useHistoryStore.getState().push({
          label: 'Add stamp',
          targetIds: [id],
          type: 'annotation-add',
          objectData: stamp,
        });
        addAnnotation(stamp as any);
        setDirty(true);
      });
      return;
    }

    // Skip draw tool here — DrawingOverlay handles it
    if (activeTool === 'draw') return;

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
      useObjectsStore.getState().addTextObject(newObj);
      setDirty(true);
      setEditingTextId(id);
      return;
    }

    if (activeTool === 'image') {
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
      shapeToolRef.current = activeTool;
    }
  }, [activeTool, pageIndex, toolOptions, renderScale, getPointerPosition, isGesturing, onLongPress, addAnnotation, addImageObject]);

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

    // Skip shape preview for draw tool — handled by DrawingOverlay
    if (activeTool === 'draw') return;

    if (['rectangle', 'ellipse', 'line', 'arrow'].includes(activeTool)) {
      setShapePreview({
        x: Math.min(pos.x, shapeStartPos.x),
        y: Math.min(pos.y, shapeStartPos.y),
        width: Math.abs(pos.x - shapeStartPos.x),
        height: Math.abs(pos.y - shapeStartPos.y),
      });
    }
  }, [activeTool, shapeStartPos, getPointerPosition]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Clear long-press timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartRef.current = null;

    if (!shapePreview) shapeToolRef.current = null;

    const pos = getPointerPosition(e);

    // Draw tool is handled by DrawingOverlay — nothing to do here
    if (activeTool === 'draw') return;

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
      shapeToolRef.current = null;
      setDirty(true);
    }
  }, [activeTool, pageIndex, toolOptions, shapePreview, getPointerPosition, addAnnotation]);

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
      {/* Layer 1: PDF page rendering */}
      <PdfPageCanvas
        pageIndex={pageIndex}
        pageWidth={pageWidth}
        pageHeight={pageHeight}
        renderScale={renderScale}
      />

      {/* Layer 2: Drawing overlay canvas (freehand strokes) */}
      <DrawingOverlay
        pageIndex={pageIndex}
        pageWidth={pageWidth}
        pageHeight={pageHeight}
        renderScale={renderScale}
        containerRef={containerRef}
        isGesturing={isGesturing}
      />

      {/* Layer 3: Shape preview while drawing */}
      <ShapePreviewOverlay
        pageIndex={pageIndex}
        shapePreview={shapePreview}
        shapeToolRef={shapeToolRef.current}
      />

      {/* Layer 4: Object overlays (text, image, annotations) */}
      <ObjectOverlays
        pageIndex={pageIndex}
        pageWidth={pageWidth}
        pageHeight={pageHeight}
        pageObjects={pageObjects}
        editingTextId={editingTextId}
        setEditingTextId={setEditingTextId}
        editingStickyId={editingStickyId}
        setEditingStickyId={setEditingStickyId}
        editingCommentId={editingCommentId}
        setEditingCommentId={setEditingCommentId}
        commentInput={commentInput}
        setCommentInput={setCommentInput}
        activeCommentId={activeCommentId}
        setActiveCommentId={setActiveCommentId}
        pageAnnotations={pageAnnotations}
        shapePreview={shapePreview}
        shapeToolRef={shapeToolRef.current}
        isObjectVisible={isObjectVisible}
        getPointerPosition={getPointerPosition}
      />
    </div>
  );
});