"use client";
import { useRef, useEffect, useState } from 'react';
import { Page, AnnotationObject } from '@pagecraft/pdf-engine';
import { useDocumentStore } from '@/stores/documentStore';
import { useToolStore } from '@/stores/toolStore';
import { TextEditOverlay } from './TextEditOverlay';
import { SelectionHandles } from './SelectionHandles';
import { cn } from '@/lib/utils';

interface PageRendererProps {
  page: Page;
  pageIndex: number;
  isActive: boolean;
  scale: number;
}

export function PageRenderer({ page, pageIndex, isActive, scale }: PageRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { textObjects, selectedObjects, selectObject, clearSelection } = useDocumentStore();
  const { activeTool } = useToolStore();
  const { setActivePage } = useDocumentStore();
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  const pageTextObjects = textObjects.filter((o) => o.pageIndex === pageIndex);
  const pageSelected = selectedObjects.filter((o) => o.pageIndex === pageIndex);
  const w = page.getWidth();
  const h = page.getHeight();

  const isSelected = selectedObjects.some((o) => o.pageIndex === pageIndex);

  // Render page with pdf.js (placeholder — pdf.js rendering done in EditorPage)
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = w * 2 * scale;
    canvas.height = h * 2 * scale;
    ctx.scale(2 * scale, 2 * scale);

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#d0d0d0';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(0, 0, w, h);
    ctx.fillStyle = '#999';
    ctx.font = `${10}px DM Sans, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`Page ${pageIndex + 1}`, w / 2, h - 12);
  }, [pageIndex, w, h, scale]);

  const handlePageClick = (e: React.MouseEvent) => {
    if (e.target !== containerRef.current) return;
    setActivePage(pageIndex);
    if (activeTool === 'select') {
      clearSelection();
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative mx-auto mb-4 page-shadow',
        isActive && 'ring-2 ring-accent',
        !isActive && isSelected && 'ring-1 ring-border-strong'
      )}
      style={{ width: w, height: h }}
      onClick={handlePageClick}
    >
      {/* PDF page canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ width: w, height: h }}
      />

      {/* Editable text overlays — from Zustand textObjects */}
      {pageTextObjects.map((textObj) => (
        <div
          key={textObj.id}
          className="absolute cursor-text"
          style={{
            left: textObj.x,
            top: textObj.y,
            width: textObj.width,
            height: textObj.height,
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (activeTool === 'select') {
              selectObject({ id: textObj.id, type: 'text', pageIndex });
            } else if (activeTool === 'text') {
              setEditingTextId(textObj.id);
            }
          }}
        >
          {pageSelected.some((o) => o.id === textObj.id) && (
            <SelectionHandles
              bbox={{ x: textObj.x, y: textObj.y, width: textObj.width, height: textObj.height, rotation: textObj.rotation }}
              onRotate={() => {}}
            />
          )}

          {!editingTextId && (
            <span
              className="block w-full h-full overflow-hidden"
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

          {editingTextId === textObj.id && (
            <TextEditOverlay
              textObject={textObj}
              onClose={() => setEditingTextId(null)}
              onSave={(newContent) => {
                useDocumentStore.getState().updateTextObject(textObj.id, { content: newContent });
                useDocumentStore.getState().setDirty(true);
                setEditingTextId(null);
              }}
            />
          )}
        </div>
      ))}

      {/* Image overlays — placeholder */}
      {page.getObjects().images.map((imgObj) => (
        <div
          key={imgObj.getId()}
          className="absolute cursor-move"
          style={{
            left: imgObj.getBBox().x,
            top: imgObj.getBBox().y,
            width: imgObj.getBBox().width,
            height: imgObj.getBBox().height,
            opacity: imgObj.getOpacity?.() ?? 1,
          }}
          onClick={(e) => {
            e.stopPropagation();
            selectObject({ id: imgObj.getId(), type: 'image', pageIndex });
          }}
        >
          {selectedObjects.some((o) => o.id === imgObj.getId()) && (
            <SelectionHandles
              bbox={imgObj.getBBox()}
              onRotate={() => {}}
            />
          )}
          <img
            src={imgObj.getSrc?.() ?? ''}
            className="w-full h-full object-cover pointer-events-none"
            draggable={false}
          />
        </div>
      ))}

      {/* Annotation overlays */}
      {page.getObjects().annotations.map((ann) => (
        <div
          key={ann.getId()}
          className="absolute"
          style={{
            left: ann.getRect().x,
            top: ann.getRect().y,
            width: ann.getRect().width,
            height: ann.getRect().height,
            opacity: ann.getOpacity(),
          }}
          onClick={(e) => {
            e.stopPropagation();
            selectObject({ id: ann.getId(), type: 'annotation', pageIndex });
          }}
        >
          <AnnotationView annotation={ann} />
        </div>
      ))}
    </div>
  );
}

function AnnotationView({ annotation }: { annotation: AnnotationObject }) {
  const type = annotation.getType();
  const color = annotation.getColor();
  const opacity = annotation.getOpacity();

  switch (type) {
    case 'highlight':
      return <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: color, opacity: opacity * 0.35 }} />;
    case 'underline':
      return <div className="absolute bottom-0 left-0 right-0 h-0.5 pointer-events-none" style={{ backgroundColor: color }} />;
    case 'strikethrough':
      return <div className="absolute top-1/2 left-0 right-0 h-0.5 pointer-events-none -translate-y-1/2" style={{ backgroundColor: color }} />;
    case 'sticky':
      return (
        <div className="w-full h-full p-2 rounded-sm shadow-md text-xs" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
          {annotation.getContents()}
        </div>
      );
    case 'shape':
      return <div className="w-full h-full border pointer-events-none" style={{ borderColor: color, borderWidth: 2 }} />;
    default:
      return null;
  }
}
