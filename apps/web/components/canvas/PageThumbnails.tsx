"use client";
import { useEffect, useRef } from "react";
import { useDocumentStore } from "@/stores/documentStore";
import { cn } from "@/lib/utils";

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
    <button
      onClick={onSelect}
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
  );
}
