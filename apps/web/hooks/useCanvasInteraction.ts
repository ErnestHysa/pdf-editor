'use client';
import { useCallback, useRef, useState } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useToolStore } from '@/stores/toolStore';
import type { BoundingBox } from '@pagecraft/pdf-engine';

interface DragState {
  type: 'move' | 'resize' | 'rotate' | 'pan' | null;
  startX: number;
  startY: number;
  objectId?: string;
  handle?: string;
  initialBBox?: BoundingBox;
}

export function useCanvasInteraction() {
  const { zoom, panOffset, setPanOffset } = useUIStore();
  const { selectObject, updateTextObject, textObjects } = useDocumentStore();
  const { activeTool } = useToolStore();

  const dragState = useRef<DragState>({ type: null, startX: 0, startY: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const screenToCanvas = useCallback((screenX: number, screenY: number, canvasRect: DOMRect) => {
    const x = (screenX - canvasRect.left - panOffset.x) / zoom;
    const y = (screenY - canvasRect.top - panOffset.y) / zoom;
    return { x, y };
  }, [zoom, panOffset]);

  const handleMouseDown = useCallback((
    e: React.MouseEvent,
    canvasRect: DOMRect,
    clickedObjectId?: string,
    pageIndex?: number
  ) => {
    const canvasPt = screenToCanvas(e.clientX, e.clientY, canvasRect);

    if (activeTool === 'select' && clickedObjectId && pageIndex !== undefined) {
      const obj = textObjects.find((o) => o.id === clickedObjectId);
      dragState.current = {
        type: 'move',
        startX: canvasPt.x,
        startY: canvasPt.y,
        objectId: clickedObjectId,
        initialBBox: obj ? { x: obj.x, y: obj.y, width: obj.width, height: obj.height } : undefined,
      };
      selectObject({ id: clickedObjectId, type: 'text', pageIndex });
      setIsDragging(true);
    } else if (e.button === 1 || (e.button === 0 && activeTool === 'select')) {
      // Middle click or space+drag — pan
      dragState.current = { type: 'pan', startX: e.clientX, startY: e.clientY };
      setIsDragging(true);
    }
  }, [activeTool, screenToCanvas, selectObject, textObjects]);

  const handleMouseMove = useCallback((e: React.MouseEvent, canvasRect: DOMRect) => {
    const ds = dragState.current;
    if (!ds.type) return;

    if (ds.type === 'pan') {
      const dx = e.clientX - ds.startX;
      const dy = e.clientY - ds.startY;
      setPanOffset({ x: panOffset.x + dx, y: panOffset.y + dy });
      ds.startX = e.clientX;
      ds.startY = e.clientY;
    } else if (ds.type === 'move' && ds.objectId && ds.initialBBox) {
      const currentCanvas = screenToCanvas(e.clientX, e.clientY, canvasRect);
      const dx = currentCanvas.x - ds.startX;
      const dy = currentCanvas.y - ds.startY;
      const newX = ds.initialBBox.x + dx;
      const newY = ds.initialBBox.y + dy;
      updateTextObject(ds.objectId, { x: newX, y: newY });
    }
  }, [panOffset, setPanOffset, screenToCanvas, updateTextObject]);

  const handleMouseUp = useCallback(() => {
    dragState.current = { type: null, startX: 0, startY: 0 };
    setIsDragging(false);
  }, []);

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    isDragging,
    screenToCanvas,
  };
}
