"use client";
import { useState, useCallback, useRef } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDocumentStore } from "@/stores/documentStore";
import { cn } from "@/lib/utils";
import { RotateCcw, RotateCw, Copy, Trash2, Crop, MoreHorizontal } from "lucide-react";

interface SortableThumbnailsProps {
  pageCount: number;
  getPageDimensions: (index: number) => { width: number; height: number };
  onReorder: (fromIndex: number, toIndex: number) => void;
}

// ── Sortable Thumbnail Slot ─────────────────────────────────────
interface SortableThumbnailSlotProps {
  pageIndex: number;
  isActive: boolean;
  onSelect: () => void;
  pdfJsDoc: any;
  getPageDimensions: (index: number) => { width: number; height: number };
  isDragOverlay?: boolean;
}

function SortableThumbnailSlot({
  pageIndex,
  isActive,
  onSelect,
  pdfJsDoc,
  getPageDimensions,
  isDragOverlay = false,
}: SortableThumbnailSlotProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `page-${pageIndex}` });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height } = getPageDimensions(pageIndex);
  const aspectRatio = width / height;

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Store actions
  const { duplicatePage, deletePage, rotatePage, cropPage } = useDocumentStore();
  const pageCount = useDocumentStore((s) => s.pdfDocument?.getPageCount() ?? 0);
  const canDelete = pageCount > 1;

  // Context menu handlers
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleRotateLeft = useCallback(() => {
    rotatePage(pageIndex, "left");
    closeContextMenu();
  }, [pageIndex, rotatePage, closeContextMenu]);

  const handleRotateRight = useCallback(() => {
    rotatePage(pageIndex, "right");
    closeContextMenu();
  }, [pageIndex, rotatePage, closeContextMenu]);

  const handleDuplicate = useCallback(() => {
    duplicatePage(pageIndex);
    closeContextMenu();
  }, [pageIndex, duplicatePage, closeContextMenu]);

  const handleDelete = useCallback(() => {
    deletePage(pageIndex);
    closeContextMenu();
  }, [pageIndex, deletePage, closeContextMenu]);

  const handleCrop = useCallback(() => {
    cropPage(pageIndex);
    closeContextMenu();
  }, [pageIndex, cropPage, closeContextMenu]);

  // Render thumbnail via pdf.js
  // Use dynamic import for pdfjs to avoid SSR issues
  const renderThumbnail = useCallback(async () => {
    if (!canvasRef.current || !pdfJsDoc) return;
    try {
      const pdfPage = await pdfJsDoc.getPage(pageIndex + 1);
      const scale = 80 / width;
      canvasRef.current.width = 80;
      canvasRef.current.height = height * scale;
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 80, canvasRef.current.height);
      const viewport = pdfPage.getViewport({ scale });
      await pdfPage.render({ canvasContext: ctx, viewport } as any).promise;
    } catch (err) {
      console.error(`Thumbnail page ${pageIndex + 1} error:`, err);
    }
  }, [pdfJsDoc, pageIndex, width, height]);

  // Re-render when pdfJsDoc changes
  const prevPdfJsDocRef = useRef(pdfJsDoc);
  if (pdfJsDoc !== prevPdfJsDocRef.current) {
    prevPdfJsDocRef.current = pdfJsDoc;
    renderThumbnail();
  }

  return (
    <>
      <div
        ref={isDragOverlay ? undefined : setNodeRef}
        {...(isDragOverlay ? {} : { ...attributes, ...listeners })}
        className={cn(
          "relative rounded overflow-hidden border transition-all duration-150 flex-shrink-0 cursor-grab active:cursor-grabbing",
          "hover:border-border-strong hover:scale-[1.02]",
          isActive ? "border-accent ring-1 ring-accent/30" : "border-border",
          isDragOverlay && "shadow-2xl scale-105 rotate-2"
        )}
        style={
          isDragOverlay
            ? undefined
            : {
                transform: CSS.Transform.toString(transform),
                transition,
                opacity: isDragging ? 0.5 : 1,
                zIndex: isDragging ? 1000 : "auto",
                width: 80,
                aspectRatio: `${80} / ${80 / aspectRatio}`,
              }
        }
        onClick={onSelect}
        onContextMenu={isDragOverlay ? undefined : handleContextMenu}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ display: "block" }}
        />
        <span className="absolute bottom-0.5 right-1.5 text-2xs font-mono text-text-tertiary bg-bg-elevated/80 px-1 rounded z-10">
          {pageIndex + 1}
        </span>
        {isDragOverlay && (
          <div className="absolute inset-0 border-2 border-accent/50 rounded" />
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={closeContextMenu}
            onContextMenu={(e) => { e.preventDefault(); closeContextMenu(); }}
          />
          <div
            className="fixed z-50 bg-bg-elevated border border-border rounded-lg shadow-xl py-1 min-w-[180px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleRotateLeft}
              className="w-full text-left px-3 py-2 text-sm hover:bg-bg-hover flex items-center gap-2 text-text-secondary"
            >
              <RotateCcw size={14} />
              Rotate Left
            </button>
            <button
              onClick={handleRotateRight}
              className="w-full text-left px-3 py-2 text-sm hover:bg-bg-hover flex items-center gap-2 text-text-secondary"
            >
              <RotateCw size={14} />
              Rotate Right
            </button>
            <button
              onClick={handleDuplicate}
              className="w-full text-left px-3 py-2 text-sm hover:bg-bg-hover flex items-center gap-2 text-text-secondary"
            >
              <Copy size={14} />
              Duplicate Page
            </button>
            <button
              onClick={handleCrop}
              className="w-full text-left px-3 py-2 text-sm hover:bg-bg-hover flex items-center gap-2 text-text-secondary"
            >
              <Crop size={14} />
              Crop This Page
            </button>
            {canDelete && (
              <>
                <div className="h-px bg-border my-1" />
                <button
                  onClick={handleDelete}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-bg-hover flex items-center gap-2 text-destructive"
                >
                  <Trash2 size={14} />
                  Delete Page
                </button>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}

// ── Sortable Thumbnails ─────────────────────────────────────────
export function SortableThumbnails({
  pageCount,
  getPageDimensions,
  onReorder,
}: SortableThumbnailsProps) {
  const { activePageIndex, setActivePage, pdfJsDoc } = useDocumentStore();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // require 8px movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Build ordered array of page ids
  const pageIds = Array.from({ length: pageCount }, (_, i) => `page-${i}`);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (!over || active.id === over.id) return;

      const activeIndex = pageIds.indexOf(active.id as string);
      const overIndex = pageIds.indexOf(over.id as string);

      if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
        onReorder(activeIndex, overIndex);
      }
    },
    [pageIds, onReorder]
  );

  // Find the active page index from the dragging id
  const activeDragIndex = activeId ? pageIds.indexOf(activeId) : -1;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={pageIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-1 px-2">
          {pageIds.map((id, i) => (
            <SortableThumbnailSlot
              key={id}
              pageIndex={i}
              isActive={i === activePageIndex}
              onSelect={() => setActivePage(i)}
              pdfJsDoc={pdfJsDoc}
              getPageDimensions={getPageDimensions}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeDragIndex !== -1 ? (
          <SortableThumbnailSlot
            pageIndex={activeDragIndex}
            isActive={activeDragIndex === activePageIndex}
            onSelect={() => {}}
            pdfJsDoc={pdfJsDoc}
            getPageDimensions={getPageDimensions}
            isDragOverlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
