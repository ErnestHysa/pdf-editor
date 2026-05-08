"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useDocumentStore } from "@/stores/documentStore";
import { cn } from "@/lib/utils";
import { RotateCcw, RotateCw, Copy, Trash2, Crop } from "lucide-react";

interface PageThumbnailsProps {
  pageCount: number;
  getPageDimensions: (index: number) => { width: number; height: number };
}

export function PageThumbnails({ pageCount, getPageDimensions }: PageThumbnailsProps) {
  const { activePageIndex, setActivePage, pdfJsDoc } = useDocumentStore();

  return (
    <div className="flex flex-col gap-1 px-2">
      {Array.from({ length: pageCount }).map((_, i) => (
        <ThumbnailSlot
          key={i}
          pageIndex={i}
          isActive={i === activePageIndex}
          onSelect={() => setActivePage(i)}
          pdfJsDoc={pdfJsDoc}
          getPageDimensions={getPageDimensions}
        />
      ))}
    </div>
  );
}

interface ThumbnailSlotProps {
  pageIndex: number;
  isActive: boolean;
  onSelect: () => void;
  pdfJsDoc: any;
  getPageDimensions: (index: number) => { width: number; height: number };
}

function ThumbnailSlot({ pageIndex, isActive, onSelect, pdfJsDoc, getPageDimensions }: ThumbnailSlotProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height } = getPageDimensions(pageIndex);
  const aspectRatio = width / height;

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
    deletePage(pageIndex);
    closeContextMenu();
  }, [pageIndex, deletePage, closeContextMenu]);

  const handleCrop = useCallback(() => {
    cropPage(pageIndex);
    closeContextMenu();
  }, [pageIndex, cropPage, closeContextMenu]);

  useEffect(() => {
    if (!canvasRef.current || !pdfJsDoc) return;
    let cancelled = false;

    pdfJsDoc.getPage(pageIndex + 1).then((pdfPage: any) => {
      if (cancelled) return;
      const canvas = canvasRef.current!;
      const scale = 80 / width; // 80px wide thumbnail
      canvas.width = 80;
      canvas.height = height * scale;

      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 80, canvas.height);

      const viewport = pdfPage.getViewport({ scale });

      const renderContext = {
        canvasContext: ctx,
        viewport,
      };

      pdfPage.render(renderContext as any).promise.then(() => {
        if (!cancelled) console.log(`[Thumbnail] page ${pageIndex + 1} rendered`);
      }).catch((err: Error) => {
        console.error(`[Thumbnail] page ${pageIndex + 1} error:`, err.message);
      });
    });

    return () => { cancelled = true; };
  }, [pdfJsDoc, pageIndex, width, height]);

  return (
    <>
      <button
        onClick={onSelect}
        onContextMenu={handleContextMenu}
        className={cn(
          "relative rounded overflow-hidden border transition-all duration-150 flex-shrink-0",
          "hover:border-border-strong hover:scale-[1.02]",
          isActive ? "border-accent ring-1 ring-accent/30" : "border-border"
        )}
        style={{ width: 80, aspectRatio: `${80} / ${80 / aspectRatio}` }}
      >
        {/* Thumbnail canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
        />

        {/* Page number */}
        <span className="absolute bottom-0.5 right-1.5 text-2xs font-mono text-text-tertiary bg-bg-elevated/80 px-1 rounded z-10">
          {pageIndex + 1}
        </span>
      </button>

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
