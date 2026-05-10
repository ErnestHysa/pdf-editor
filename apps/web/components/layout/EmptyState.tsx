"use client";
import { useCallback, useState, useEffect } from "react";
import { Upload, FileText, X, Clock, File } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRecentFiles, RecentFile } from "@/hooks/useRecentFiles";
import { __setProgrammaticHandler } from "@/hooks/useFileHandler";
import { PdfEngine } from "@pagecraft/pdf-engine";
import { useDocumentStore } from "@/stores/documentStore";
import { useUIStore } from "@/stores/uiStore";

interface EmptyStateProps {
  onFile: (file: File) => Promise<void>;
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString();
}

function RecentFileCard({
  file,
  onClick,
  onRemove,
}: {
  file: RecentFile;
  onClick: () => void;
  onRemove: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="relative group flex-shrink-0 w-36 cursor-pointer"
      onClick={onClick}
    >
      <div className="rounded-lg border border-border bg-bg-surface overflow-hidden shadow-sm hover:shadow-md transition-shadow">
        {/* Thumbnail */}
        <div className="w-full aspect-[100/140] bg-bg-elevated flex items-center justify-center overflow-hidden">
          {file.thumbnail ? (
            <img
              src={file.thumbnail}
              alt={file.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <File size={40} className="text-text-tertiary" />
          )}
        </div>
        {/* Info */}
        <div className="p-2">
          <p className="text-xs font-medium text-text-primary truncate" title={file.name}>
            {file.name}
          </p>
          <div className="flex items-center gap-1 mt-0.5 text-[10px] text-text-secondary">
            <Clock size={9} />
            <span>{formatDate(file.lastOpened)}</span>
            <span className="mx-0.5">·</span>
            <span>{file.pageCount} {file.pageCount === 1 ? "page" : "pages"}</span>
          </div>
        </div>
      </div>
      {/* Remove button */}
      <button
        onClick={onRemove}
        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-bg-elevated/90 border border-border text-text-secondary hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
        title="Remove from recent"
      >
        <X size={10} />
      </button>
    </div>
  );
}

export function EmptyState({ onFile }: EmptyStateProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { recentFiles, clearAll, removeFile } = useRecentFiles();
  const { setDocument } = useDocumentStore();
  const { setZoom } = useUIStore();

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.includes("pdf") && !file.name.endsWith(".pdf")) {
      setError("Please select a PDF file.");
      return;
    }
    setError(null);
    try {
      await onFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open file.");
    }
  }, [onFile]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const loadRecentFile = useCallback(async (recentFile: RecentFile) => {
    setIsLoading(true);
    try {
      const engine = new PdfEngine();
      const doc = await engine.load(recentFile.pdfData);
      setDocument(doc, recentFile.name, recentFile.pdfData.byteLength);
      setZoom(1.0);
    } catch (err) {
      console.error("[RecentFiles] load failed:", err);
      setError("Failed to open document.");
    } finally {
      setIsLoading(false);
    }
  }, [setDocument, setZoom]);

  // Register programmatic PDF loading handler (for ?pdf= URL param)
  useEffect(() => {
    __setProgrammaticHandler(handleFile);
    return () => { __setProgrammaticHandler(() => Promise.resolve()); };
  }, [handleFile]);

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[500px] px-8">
      {/* Recent Documents */}
      {recentFiles.length > 0 && (
        <div className="w-full max-w-2xl mb-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-text-primary">Recent Documents</h3>
            <button
              onClick={clearAll}
              className="text-xs text-text-tertiary hover:text-destructive transition-colors"
            >
              Clear all
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
            {recentFiles.map((file) => (
              <RecentFileCard
                key={file.hash}
                file={file}
                onClick={() => loadRecentFile(file)}
                onRemove={(e) => {
                  e.stopPropagation();
                  removeFile(file.hash);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* No recent docs message */}
      {recentFiles.length === 0 && (
        <p className="text-sm text-text-tertiary mb-6">No recent documents</p>
      )}

      {/* Upload area */}
      <div
        className={cn(
          "relative flex flex-col items-center justify-center w-full max-w-md rounded-xl border-2 border-dashed transition-all duration-200",
          isDragOver
            ? "border-accent bg-accent-muted scale-[1.02]"
            : "border-border hover:border-border-strong bg-bg-surface/50"
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        {/* Icon */}
        <div
          className={cn(
            "w-16 h-16 rounded-2xl flex items-center justify-center mb-6 transition-colors",
            isDragOver ? "bg-accent/20" : "bg-bg-elevated"
          )}
        >
          <Upload
            size={28}
            className={isDragOver ? "text-accent" : "text-text-tertiary"}
          />
        </div>

        <h2 className="font-serif text-2xl text-text-primary mb-2 text-center">
          Drop your PDF here
        </h2>
        <p className="text-sm text-text-secondary text-center mb-6">
          or click to browse your files.
          <br />
          Up to 50MB, any page count.
        </p>

        <label className="cursor-pointer">
          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileInput}
            className="hidden"
          />
          <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors">
            <FileText size={16} />
            Open PDF
          </span>
        </label>

        {error && (
          <p className="mt-3 text-xs text-destructive">{error}</p>
        )}

        {isLoading && (
          <p className="mt-3 text-xs text-text-secondary">Opening document...</p>
        )}

        <p className="mt-4 text-xs text-text-tertiary text-center">
          All editing happens locally.
          <br />
          Your files never leave your device.
        </p>
      </div>
    </div>
  );
}
