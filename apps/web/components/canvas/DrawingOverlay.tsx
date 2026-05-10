'use client';
import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { useObjectsStore } from '@/stores/objectsStore';
import { useToolStore } from '@/stores/toolStore';
import { useHistoryStore } from '@/stores/historyStore';

interface DrawingOverlayProps {
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  renderScale: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isGesturing?: boolean;
}

// Returns bounding box of points
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
  if (width < 2 && height < 2) {
    const pt = points[0];
    return { x: pt.x - 2, y: pt.y - 2, width: 4, height: 4 };
  }
  if (width < 2) width = 4;
  if (height < 2) height = 4;
  return { x: minX, y: minY, width, height };
}

// ── Drawing canvas overlay for freehand strokes (interactive) ──────
export const DrawingOverlay = memo(function DrawingOverlay({
  pageIndex,
  pageWidth,
  pageHeight,
  renderScale,
  containerRef,
  isGesturing = false,
}: DrawingOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const cancelledRef = useRef(false);
  const isDrawingRef = useRef(false);
  const drawingPointsRef = useRef<Array<{ x: number; y: number }>>([]);

  const { activeTool, toolOptions } = useToolStore();
  const addAnnotation = useObjectsStore((s) => s.addAnnotation);
  const annotations = useObjectsStore((s) => s.annotations);

  const getPointerPosition = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (e.clientX - rect.left) / renderScale,
      y: (e.clientY - rect.top) / renderScale,
    };
  }, [containerRef, renderScale]);

  // ── Canvas size setup ──────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = pageWidth * renderScale;
    canvas.height = pageHeight * renderScale;
    ctxRef.current = canvas.getContext('2d');
  }, [pageWidth, pageHeight, renderScale]);

  // ── Render completed drawing annotations ───────────────────────────
  useEffect(() => {
    cancelledRef.current = true;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    cancelledRef.current = false;
    ctxRef.current = ctx;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const drawingAnnotations = annotations.filter(
      (a: { type: string; pageIndex: number }) => a.type === 'drawing' && a.pageIndex === pageIndex
    );
    for (const ann of drawingAnnotations) {
      const img = new Image();
      img.onload = () => {
        if (cancelledRef.current || !ctxRef.current) return;
        ctxRef.current.drawImage(img, ann.x * renderScale, ann.y * renderScale,
          ann.width * renderScale, ann.height * renderScale);
        URL.revokeObjectURL(img.src);
      };
      img.src = (ann as unknown as { imageData?: string }).imageData ?? '';
    }
    return () => { cancelledRef.current = true; };
  }, [annotations, pageIndex, renderScale]);

  // ── Interactive drawing pointer events ─────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    if (isGesturing) return;
    if (activeTool !== 'draw') return;

    const pos = getPointerPosition(e);
    isDrawingRef.current = true;
    drawingPointsRef.current = [pos];
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(pos.x * renderScale, pos.y * renderScale);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [activeTool, isGesturing, getPointerPosition, renderScale]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const pos = getPointerPosition(e);
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.lineTo(pos.x * renderScale, pos.y * renderScale);
    ctx.stroke();
    drawingPointsRef.current.push(pos);
  }, [getPointerPosition, renderScale]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = ctxRef.current;
    if (!ctx) return;

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
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }, [pageIndex, toolOptions, addAnnotation]);

  const isDrawTool = activeTool === 'draw';

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{
        width: pageWidth,
        height: pageHeight,
        pointerEvents: isDrawTool ? 'auto' : 'none',
        touchAction: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  );
});