'use client';
import { memo } from 'react';
import { useObjectsStore } from '@/stores/objectsStore';
import { useToolStore } from '@/stores/toolStore';
import { ShapePreview } from './ShapePreview';

interface ShapePreviewOverlayProps {
  pageIndex: number;
  shapePreview: { x: number; y: number; width: number; height: number } | null;
  shapeToolRef: string | null;
}

/**
 * Renders the live shape preview while the user is dragging a shape tool.
 * This is a pure presentational overlay — state lives in PageCanvas.
 */
export const ShapePreviewOverlay = memo(function ShapePreviewOverlay({
  pageIndex,
  shapePreview,
  shapeToolRef,
}: ShapePreviewOverlayProps) {
  const { toolOptions } = useToolStore();

  if (!shapePreview || !shapeToolRef) return null;

  return (
    <ShapePreview
      type={shapeToolRef as 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'highlight' | 'underline' | 'strikethrough'}
      preview={shapePreview}
      color={toolOptions.color}
      strokeWidth={toolOptions.strokeWidth ?? 2}
      opacity={toolOptions.opacity}
    />
  );
});