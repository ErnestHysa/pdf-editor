'use client';
import { useRef, useEffect, useState } from 'react';
import { Page } from '@pagecraft/pdf-engine';
import { useDocumentStore, SelectedObject } from '@/stores/documentStore';
import { useToolStore } from '@/stores/toolStore';
import { useUIStore } from '@/stores/uiStore';
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
  const { selectedObjects, selectObject, selectObjects, clearSelection } = useDocumentStore();
  const { activeTool } = useToolStore();
  const { setActivePage } = useDocumentStore();
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  const isSelected = selectedObjects.some(o => o.pageIndex === pageIndex);
  const w = page.getWidth();
  const h = page.getHeight();

  // Render page with pdf.js
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = w * 2 * scale; // 2x for retina
    canvas.height = h * 2 * scale;
    ctx.scale(2 * scale, 2 * scale);

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    // Placeholder: render a page border + page number
    ctx.strokeStyle = '#d0d0d0';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(0, 0, w, h);
    ctx.fillStyle = '#999';
    ctx.font = `${10}px DM Sans, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`Page ${pageIndex + 1}`, w / 2, h - 12);

    // TODO: Integrate pdf.js renderer here
    // const page = await pdfDoc.getPage(pageIndex);
    // await page.render({ canvasContext: ctx, transform: [scale, 0, 0, scale, 0, 0] }).promise;
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

      {/* Editable text overlays */}
      {page.getObjects().texts.map((textObj) => (
        <div
          key={textObj.getId()}
          className="absolute cursor-text"
          style={{
            left: textObj.getBBox().x,
            top: textObj.getBBox().y,
            width: textObj.getBBox().width,
            height: textObj.getBBox().height,
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (activeTool === 'select') {
              selectObject({ id: textObj.getId(), type: 'text', pageIndex });
            } else if (activeTool === 'text') {
              setEditingTextId(textObj.getId());
            }
          }}
        >
          {/* Selection border */}
          {selectedObjects.some(o => o.id === textObj.getId()) && (
            <SelectionHandles
              bbox={textObj.getBBox()}
              onRotate={() => {}}
            />
          )}

          {/* Text display */}
          {!editingTextId && (
            <span
              className="block w-full h-full overflow-hidden"
              style={{
                fontFamily: textObj.getStyle().fontFamily,
                fontSize: textObj.getStyle().fontSize,
                fontWeight: textObj.getStyle().fontWeight,
                fontStyle: textObj.getStyle().fontStyle,
                color: textObj.getStyle().color,
                textAlign: textObj.getStyle().textAlign,
                lineHeight: 1.4,
              }}
            >
              {textObj.getContent()}
            </span>
          )}

          {/* Inline text editor */}
          {editingTextId === textObj.getId() && (
            <TextEditOverlay
              textObject={textObj}
              onClose={() => setEditingTextId(null)}
              onSave={(newContent) => {
                textObj.setContent(newContent);
                setEditingTextId(null);
                useDocumentStore.getState().setDirty(true);
              }}
            />
          )}
        </div>
      ))}

      {/* Image overlays */}
      {page.getObjects().images.map((imgObj) => (
        <div
          key={imgObj.getId()}
          className="absolute cursor-move"
          style={{
            left: imgObj.getBBox().x,
            top: imgObj.getBBox().y,
            width: imgObj.getBBox().width,
            height: imgObj.getBBox().height,
            opacity: imgObj.getOpacity(),
          }}
          onClick={(e) => {
            e.stopPropagation();
            selectObject({ id: imgObj.getId(), type: 'image', pageIndex });
          }}
        >
          {selectedObjects.some(o => o.id === imgObj.getId()) && (
            <SelectionHandles
              bbox={imgObj.getBBox()}
              onRotate={() => {}}
            />
          )}
          <img
            src={imgObj.getSrc()}
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
          {/* Annotation rendering — varies by type */}
          <AnnotationView annotation={ann} />
        </div>
      ))}
    </div>
  );
}

// Simple annotation renderer by type
function AnnotationView({ annotation }: { annotation: any }) {
  const type = annotation.getType();
  const color = annotation.getColor();
  const opacity = annotation.getOpacity();

  switch (type) {
    case 'highlight':
      return (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundColor: color, opacity: opacity * 0.35 }}
        />
      );
    case 'underline':
      return (
        <div
          className="absolute bottom-0 left-0 right-0 h-0.5 pointer-events-none"
          style={{ backgroundColor: color }}
        />
      );
    case 'strikethrough':
      return (
        <div
          className="absolute top-1/2 left-0 right-0 h-0.5 pointer-events-none -translate-y-1/2"
          style={{ backgroundColor: color }}
        />
      );
    case 'sticky':
      return (
        <div
          className="w-full h-full p-2 rounded-sm shadow-md text-xs"
          style={{ backgroundColor: '#fef3c7', color: '#92400e' }}
        >
          {annotation.getContents()}
        </div>
      );
    case 'shape':
      return (
        <div
          className="w-full h-full border pointer-events-none"
          style={{ borderColor: color, borderWidth: 2 }}
        />
      );
    default:
      return null;
  }
}
