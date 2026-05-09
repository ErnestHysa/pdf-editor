"use client";
import { useState, useCallback, useRef, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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

// ── Memoized Thumbnail Slot ─────────────────────────────────────
const SortableThumbnailSlot = memo(function SortableThumbnailSlot({
  pageIndex,
  isActive,
  onSelect,
  pdfJsDoc,
  getPageDimensions,
  isDragOverlay = false,
}: {
  pageIndex: number;
  isActive: boolean;
  onSelect: () => void;
  pdfJsDoc: any;
  getPageDimensions: (index: number) => { width: number; height: number };
  isDragOverlay?: boolean;
}) {
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
  const thumbWidth = 80;

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Store actions
  const { duplicatePage, deletePage, rotatePage, cropPage } = useDocumentStore();
  const pageCount = useDocumentStore((s) => s.pdfDocument?.getPageCount() ?? 0) as number;
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
    if (window.confirm(`Delete page ${pageIndex + 1}? This cannot be undone.`)) {
      deletePage(pageIndex);
    }
    closeContextMenu();
  }, [pageIndex, deletePage, closeContextMenu]);

  const handleCrop = useCallback(() => {
    cropPage(pageIndex);
    closeContextMenu();
  }, [pageIndex, cropPage, closeContextMenu]);

  // Render thumbnail via pdf.js — memoized to avoid re-renders
  const renderThumbnail = useCallback(async () => {
    if (!canvasRef.current || !pdfJsDoc) return;
    try {
      const pdfPage = await pdfJsDoc.getPage(pageIndex + 1);
      const scale = thumbWidth / width;
      canvasRef.current.width = thumbWidth;
      canvasRef.current.height = height * scale;
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, thumbWidth, canvasRef.current.height);
      const viewport = pdfPage.getViewport({ scale });
      await pdfPage.render({ canvasContext: ctx, viewport } as any).promise;
    } catch (err) {
      console.error(`Thumbnail page ${pageIndex + 1} error:`, err);
    }
  }, [pdfJsDoc, pageIndex, width, height, thumbWidth]);

  // Render when pdfJsDoc changes
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
                width: thumbWidth,
                aspectRatio: `${thumbWidth} / ${(thumbWidth * height) / width}`,
              }
        }
        data-page-index={pageIndex}
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
});

// ── Sortable Thumbnails (Virtualized) ───────────────────────────
export function SortableThumbnails({
  pageCount,
  getPageDimensions,
  onReorder,
}: SortableThumbnailsProps) {
  const { activePageIndex, setActivePage, pdfJsDoc } = useDocumentStore();
  const [activeId, setActiveId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Full list of page ids — used by dnd-kit for drag coordination
  const pageIds = Array.from({ length: pageCount }, (_, i) => `page-${i}`);

  // Virtualizer — only renders visible thumbnails
  const virtualizer = useVirtualizer({
    count: pageCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 84, // 80px thumbnail + 4px gap
    overscan: 5,
  });

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

  const activeDragIndex = activeId ? pageIds.indexOf(activeId) : -1;
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={pageIds} strategy={verticalListSortingStrategy}>
        {/* Scrollable virtualized container */}
        <div
          ref={scrollRef}
          className="flex flex-col gap-1 px-2 overflow-y-auto"
          style={{ height: "100%" }}
          tabIndex={0}
          onKeyDown={(e) => {
            const total = pageCount;
            if (total === 0) return;
            let next = virtualizer.getVirtualItems()[0]?.index ?? 0;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault();
              next = Math.min(total - 1, (pageIds.indexOf(activeId ?? `page-${activePageIndex}`) + 1) % total);
              const nextPage = document.querySelector(`[data-page-index="${next}"]`) as HTMLElement;
              nextPage?.focus();
              if (!nextPage) setActivePage(next);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault();
              const curIdx = pageIds.indexOf(activeId ?? `page-${activePageIndex}`);
              next = (curIdx - 1 + total) % total;
              const nextPage = document.querySelector(`[data-page-index="${next}"]`) as HTMLElement;
              nextPage?.focus();
              if (!nextPage) setActivePage(next);
            } else if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              const curIdx = pageIds.indexOf(activeId ?? `page-${activePageIndex}`);
              setActivePage(curIdx === -1 ? activePageIndex : curIdx);
            }
          }}
        >
          {/* Total scroll size spacer */}
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: "relative",
            }}
          >
            {virtualItems.map((virtualItem) => (
              <div
                key={pageIds[virtualItem.index]}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: virtualItem.size,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <SortableThumbnailSlot
                  pageIndex={virtualItem.index}
                  isActive={virtualItem.index === activePageIndex}
                  onSelect={() => setActivePage(virtualItem.index)}
                  pdfJsDoc={pdfJsDoc}
                  getPageDimensions={getPageDimensions}
                />
              </div>
            ))}
          </div>
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