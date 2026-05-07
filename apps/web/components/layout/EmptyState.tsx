"use client";
import { useCallback, useState } from "react";
import { Upload, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  onFile: (file: File) => Promise<void>;
}

export function EmptyState({ onFile }: EmptyStateProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[500px] px-8">
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

        <p className="mt-4 text-xs text-text-tertiary text-center">
          All editing happens locally.
          <br />
          Your files never leave your device.
        </p>
      </div>
    </div>
  );
}
