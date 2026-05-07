"use client";
import { useRef } from "react";
import { useDocumentStore } from "@/stores/documentStore";
import { cn } from "@/lib/utils";
import type { Page } from "@pagecraft/pdf-engine";

interface PageThumbnailsProps {
  pages: Page[];
}

export function PageThumbnails({ pages }: PageThumbnailsProps) {
  const { activePageIndex, setActivePage } = useDocumentStore();

  return (
    <div className="flex flex-col gap-1 px-2">
      {pages.map((page, i) => (
        <button
          key={i}
          onClick={() => setActivePage(i)}
          className={cn(
            "relative rounded overflow-hidden border transition-all duration-150 flex-shrink-0",
            "hover:border-border-strong hover:scale-[1.02]",
            i === activePageIndex
              ? "border-accent ring-1 ring-accent/30"
              : "border-border"
          )}
          style={{
            width: 80,
            aspectRatio: `${page.getWidth()} / ${page.getHeight()}`,
          }}
        >
          {/* Thumbnail background */}
          <div className="absolute inset-0 bg-white" />

          {/* Page number */}
          <span className="absolute bottom-0.5 right-1.5 text-2xs font-mono text-text-tertiary bg-bg-elevated/80 px-1 rounded z-10">
            {i + 1}
          </span>
        </button>
      ))}
    </div>
  );
}
