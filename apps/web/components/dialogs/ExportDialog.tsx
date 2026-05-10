"use client";
import { useState, useRef, useEffect } from "react";
import { X, FileText, FileArchive, Image, Loader2 } from "lucide-react";
import { useDocumentStore } from "@/stores/documentStore";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import {
  exportPdfWithChanges,
  exportPdfWithNativeAnnotations,
  exportPdfOptimized,
  exportPageAsImage,
} from "@/hooks/usePdfExporter";

type ExportFormat = "pdf" | "flattened" | "optimized" | "png" | "jpeg";
type PageRange = "all" | "current" | "custom";

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function uint8ToBlobPart(bytes: Uint8Array): BlobPart {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy;
}

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ExportDialog({ open, onClose }: ExportDialogProps) {
  const { fileName, activePageIndex, pdfDocument } = useDocumentStore();
  const pageCount = pdfDocument?.getPageCount() ?? 1;

  const [filename, setFilename] = useState(
    fileName.replace(/\.pdf$/i, "") + "-exported"
  );
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [pageRange, setPageRange] = useState<PageRange>("all");
  const [customStart, setCustomStart] = useState(1);
  const [customEnd, setCustomEnd] = useState(pageCount);
  const [quality, setQuality] = useState(85);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Focus trap
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      focusable?.[0]?.focus();
    } else {
      previousFocusRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const baseName = filename.replace(/\.(pdf|png|jpg|jpeg)$/i, "");
      let blob: Blob;
      let finalName: string;

      if (format === "png" || format === "jpeg") {
        const pageIdx =
          pageRange === "current"
            ? activePageIndex
            : pageRange === "custom"
            ? customStart - 1
            : 0;
        const imgBlob = await exportPageAsImage(
          pageIdx,
          format,
          format === "jpeg" ? quality / 100 : undefined
        );
        blob = imgBlob;
        finalName = `${baseName}-page${pageIdx + 1}.${format}`;
      } else {
        let bytes: Uint8Array;
        if (format === "flattened") {
          bytes = await exportPdfWithNativeAnnotations();
        } else if (format === "optimized") {
          bytes = await exportPdfOptimized();
        } else {
          bytes = await exportPdfWithChanges();
        }
        blob = new Blob([uint8ToBlobPart(bytes)], { type: "application/pdf" });
        finalName = `${baseName}.pdf`;
      }

      downloadBlob(blob, finalName);
      onClose();
    } catch (err) {
      console.error("Export failed:", err);
      setError("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const isImageFormat = format === "png" || format === "jpeg";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Export"
        className="relative bg-bg-elevated border border-border rounded-xl shadow-2xl w-[440px] animate-scale-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary">Export</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-hover text-text-tertiary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* Filename */}
          <div>
            <label className="text-xs text-text-secondary block mb-2">
              Filename
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="flex-1 bg-bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
                placeholder="filename"
              />
              <span className="text-sm text-text-tertiary">.pdf</span>
            </div>
          </div>

          {/* Format */}
          <div>
            <label className="text-xs text-text-secondary block mb-2">
              Format
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  id: "pdf",
                  label: "PDF",
                  icon: FileText,
                  desc: "Editable",
                },
                {
                  id: "flattened",
                  label: "Flattened",
                  icon: FileArchive,
                  desc: "Merged",
                },
                {
                  id: "optimized",
                  label: "Optimized",
                  icon: FileArchive,
                  desc: "Compressed",
                },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFormat(f.id as ExportFormat)}
                  className={cn(
                    "flex flex-col items-center gap-1 p-3 rounded-lg border text-sm transition-colors",
                    format === f.id
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-bg-surface text-text-secondary hover:border-accent/50"
                  )}
                >
                  <f.icon size={16} />
                  <span className="font-medium">{f.label}</span>
                  <span className="text-xs text-text-tertiary">{f.desc}</span>
                </button>
              ))}
            </div>
            {/* Image format row */}
            <div className="grid grid-cols-2 gap-2 mt-2">
              {[
                { id: "png", label: "PNG", icon: Image },
                { id: "jpeg", label: "JPEG", icon: Image },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFormat(f.id as ExportFormat)}
                  className={cn(
                    "flex items-center justify-center gap-2 p-2 rounded-lg border text-sm transition-colors",
                    format === f.id
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-bg-surface text-text-secondary hover:border-accent/50"
                  )}
                >
                  <f.icon size={14} />
                  <span>{f.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Page Range (only for PDF formats) */}
          {!isImageFormat && (
            <div>
              <label className="text-xs text-text-secondary block mb-2">
                Pages
              </label>
              <div className="flex gap-2">
                {(["all", "current", "custom"] as PageRange[]).map((range) => (
                  <button
                    key={range}
                    onClick={() => setPageRange(range)}
                    className={cn(
                      "flex-1 py-2 rounded-lg border text-xs transition-colors capitalize",
                      pageRange === range
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border bg-bg-surface text-text-secondary hover:border-accent/50"
                    )}
                  >
                    {range === "custom" ? "Custom" : range}
                  </button>
                ))}
              </div>
              {pageRange === "custom" && (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="number"
                    min={1}
                    max={pageCount}
                    value={customStart}
                    onChange={(e) =>
                      setCustomStart(Math.max(1, parseInt(e.target.value) || 1))
                    }
                    className="w-16 bg-bg-surface border border-border rounded px-2 py-1.5 text-sm text-text-primary text-center"
                  />
                  <span className="text-text-tertiary">to</span>
                  <input
                    type="number"
                    min={customStart}
                    max={pageCount}
                    value={customEnd}
                    onChange={(e) =>
                      setCustomEnd(
                        Math.min(pageCount, Math.max(customStart, parseInt(e.target.value) || customStart))
                      )
                    }
                    className="w-16 bg-bg-surface border border-border rounded px-2 py-1.5 text-sm text-text-primary text-center"
                  />
                  <span className="text-xs text-text-tertiary">
                    of {pageCount} pages
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Quality (for JPEG) */}
          {format === "jpeg" && (
            <div>
              <label className="text-xs text-text-secondary block mb-2">
                Quality: {quality}%
              </label>
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="w-full accent-accent"
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-xs text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors",
              exporting
                ? "bg-accent/50 cursor-not-allowed"
                : "bg-accent hover:bg-accent-hover"
            )}
          >
            {exporting && <Loader2 size={14} className="animate-spin" />}
            {exporting ? "Exporting..." : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}