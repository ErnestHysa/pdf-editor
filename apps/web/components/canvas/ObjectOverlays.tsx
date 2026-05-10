'use client';
import { memo } from 'react';
import { useDocumentStore } from '@/stores/documentStore';
import { useToolStore } from '@/stores/toolStore';
import { useObjectsStore } from '@/stores/objectsStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useSearchStore } from '@/stores/searchStore';
import { glyphPreservingEdit } from '@pagecraft/pdf-engine';
import { TextEditOverlay } from './TextEditOverlay';
import { SelectionHandles } from './SelectionHandles';
import { ZustandAnnotationView } from './ZustandAnnotationView';
import { ShapePreview } from './ShapePreview';
import type { SerializableTextObject } from '@/stores/documentStore';

interface ObjectOverlaysProps {
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  pageObjects: { images?: any[] };
  editingTextId: string | null;
  setEditingTextId: (id: string | null) => void;
  editingStickyId: string | null;
  setEditingStickyId: (id: string | null) => void;
  editingCommentId: string | null;
  setEditingCommentId: (id: string | null) => void;
  commentInput: string;
  setCommentInput: (v: string) => void;
  activeCommentId: string | null;
  setActiveCommentId: (id: string | null) => void;
  pageAnnotations: any[];
  shapePreview: { x: number; y: number; width: number; height: number } | null;
  shapeToolRef: string | null;
  isObjectVisible: (x: number, y: number, w: number, h: number) => boolean;
  getPointerPosition: (e: React.PointerEvent<HTMLDivElement>) => { x: number; y: number };
}

export const ObjectOverlays = memo(function ObjectOverlays({
  pageIndex,
  pageWidth,
  pageHeight,
  pageObjects,
  editingTextId,
  setEditingTextId,
  editingStickyId,
  setEditingStickyId,
  editingCommentId,
  setEditingCommentId,
  commentInput,
  setCommentInput,
  activeCommentId,
  setActiveCommentId,
  pageAnnotations,
  shapePreview,
  shapeToolRef,
  isObjectVisible,
  getPointerPosition,
}: ObjectOverlaysProps) {
  const textObjects = useObjectsStore(
    (s) => s.textObjects.filter(o => o.pageIndex === pageIndex)
  );
  const imageObjects = useObjectsStore(
    (s) => s.imageObjects.filter(o => o.pageIndex === pageIndex)
  );
  const { toolOptions } = useToolStore();
  const selectedObjects = useSelectionStore((s) => s.selectedObjects);
  const updateImageObject = useObjectsStore((s) => s.updateImageObject);
  const selectObject = useSelectionStore((s) => s.selectObject);
  const updateAnnotation = useObjectsStore((s) => s.updateAnnotation);
  const setDirty = useDocumentStore((s) => s.setDirty);
  const searchActiveMatches = useSearchStore((s) => s.searchActiveMatches);
  const updateTextObject = useObjectsStore((s) => s.updateTextObject);

  const pageSelected = selectedObjects.filter((o: { pageIndex: number }) => o.pageIndex === pageIndex);
  const pageTextObjects = textObjects as SerializableTextObject[];

  return (
    <>
      {/* Shape preview while drawing */}
      {shapePreview && (
        <ShapePreview
          type={shapeToolRef as 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'highlight' | 'underline' | 'strikethrough'}
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
                  else if (handle === 'sw') { nx += dx; nw -= dx; nh -= dy; }
                  else if (handle === 'n') { ny += dy; nh -= dy; }
                  else if (handle === 's') { nh += dy; }
                  else if (handle === 'e') { nw += dx; }
                  else if (handle === 'w') { nx += dx; nw -= dx; }

                  if (nw >= 10 && nh >= 10) {
                    useObjectsStore.getState().updateTextObject(textObj.id, { x: nx, y: ny, width: nw, height: nh });
                    setDirty(true);
                  }
                }}
                onRotateMove={(deg) => {
                  useObjectsStore.getState().updateTextObject(textObj.id, { rotation: deg });
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
                    useObjectsStore.getState().updateTextObject(textObj.id, { content: newContent });
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
                  else if (handle === 'sw') { nx += dx; nw -= dx; nh -= dy; }
                  else if (handle === 'n') { ny += dy; nh -= dy; }
                  else if (handle === 's') { nh += dy; }
                  else if (handle === 'e') { nw += dx; }
                  else if (handle === 'w') { nx += dx; nw -= dx; }
                  if (nw >= 10 && nh >= 10) {
                    imgObj.setBBox({ x: nx, y: ny, width: nw, height: nh });
                    setDirty(true);
                  }
                }}
                onRotateMove={(deg) => { imgObj.setRotation(deg); setDirty(true); }}
              />
            )}
            <img src={imgObj.getSrc?.() ?? ''} className="w-full h-full object-cover pointer-events-none" draggable={false} alt="" />
          </div>
        );
      })}

{/* Zustand ImageObject overlays — user-added images */}
      {imageObjects
        .filter((img) => isObjectVisible(img.x, img.y, img.width, img.height))
        .map((imgObj) => {
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
                  else if (handle === 'sw') { nx += dx; nw -= dx; nh -= dy; }
                  else if (handle === 'n') { ny += dy; nh -= dy; }
                  else if (handle === 's') { nh += dy; }
                  else if (handle === 'e') { nw += dx; }
                  else if (handle === 'w') { nx += dx; nw -= dx; }

                  if (nw >= 10 && nh >= 10) updateImageObject(imgObj.id, { x: nx, y: ny, width: nw, height: nh });
                }}
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
                  else if (handle === 'sw') { nx += dx; nw -= dx; nh -= dy; }
                  else if (handle === 'n') { ny += dy; nh -= dy; }
                  else if (handle === 's') { nh += dy; }
                  else if (handle === 'e') { nw += dx; }
                  else if (handle === 'w') { nx += dx; nw -= dx; }

                  if (nw >= 10 && nh >= 10) updateAnnotation(ann.id, { x: nx, y: ny, width: nw, height: nh });
                }}
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
    </>
  );
});