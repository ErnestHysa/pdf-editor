"use client";
import { useState, useRef, useCallback } from "react";
import { useDocumentStore } from "@/stores/documentStore";
import { X, FileUp, Plus } from "lucide-react";
import { PAGE_SIZES } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface InsertPageDialogProps {
  open: boolean;
  onClose: () => void;
  mode: "blank" | "file";
  insertAfterIndex?: number;
}

export function InsertPageDialog({ open, onClose, mode, insertAfterIndex = -1 }: InsertPageDialogProps) {
  const { addPage, insertPagesFromFile } = useDocumentStore();
  const [selectedSize, setSelectedSize] = useState<"A4" | "Letter" | "Legal" | "A5" | "custom">("A4");
  const [customWidth, setCustomWidth] = useState(612);
  const [customHeight, setCustomHeight] = useState(792);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleInsertBlank = useCallback(() => {
    let size: { width: number; height: number } | undefined;
    if (selectedSize === "custom") {
      size = { width: customWidth, height: customHeight };
    } else {
      size = PAGE_SIZES[selectedSize];
    }
    addPage(insertAfterIndex, size);
    onClose();
  }, [selectedSize, customWidth, customHeight, insertAfterIndex, addPage, onClose]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.includes("pdf") && !file.name.endsWith(".pdf")) {
      setError("Please select a PDF file.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const count = await insertPagesFromFile(file, insertAfterIndex);
      if (count === 0) {
        setError("No pages could be inserted from this file.");
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to insert pages");
    } finally {
      setIsLoading(false);
    }
  }, [insertPagesFromFile, insertAfterIndex, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-bg-elevated border border-border rounded-xl shadow-2xl w-[400px] animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary">
            {mode === "blank" ? "Insert Blank Page" : "Insert Pages from File"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-hover text-text-tertiary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {mode === "blank" ? (
            <div className="space-y-4">
              {/* Page Size Presets */}
              <div>
                <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider block mb-2">
                  Page Size
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["A4", "Letter", "Legal", "A5"] as const).map((size) => (
                    <button
                      key={size}
                      onClick={() => setSelectedSize(size)}
                      className={cn(
                        "px-3 py-2 text-sm rounded-lg border transition-colors text-left",
                        selectedSize === size
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border hover:border-border-strong text-text-secondary"
                      )}
                    >
                      <div className="font-medium">{size}</div>
                      <div className="text-2xs text-text-tertiary mt-0.5">
                        {PAGE_SIZES[size].width} × {PAGE_SIZES[size].height} pt
                      </div>
                    </button>
                  ))}
                  <button
                    onClick={() => setSelectedSize("custom")}
                    className={cn(
                      "px-3 py-2 text-sm rounded-lg border transition-colors text-left",
                      selectedSize === "custom"
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border hover:border-border-strong text-text-secondary"
                    )}
                  >
                    <div className="font-medium">Custom</div>
                    <div className="text-2xs text-text-tertiary mt-0.5">Specify dimensions</div>
                  </button>
                </div>
              </div>

              {/* Custom dimensions */}
              {selectedSize === "custom" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-text-tertiary uppercase tracking-wider block mb-1">Width (pt)</label>
                    <input
                      type="number"
                      value={customWidth}
                      onChange={(e) => setCustomWidth(Number(e.target.value))}
                      className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary"
                      min={72} max={14400}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-tertiary uppercase tracking-wider block mb-1">Height (pt)</label>
                    <input
                      type="number"
                      value={customHeight}
                      onChange={(e) => setCustomHeight(Number(e.target.value))}
                      className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary"
                      min={72} max={14400}
                    />
                  </div>
                </div>
              )}

              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* File drop zone */}
              <div
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-accent transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp size={32} className="mx-auto text-text-tertiary mb-3" />
                <p className="text-sm text-text-secondary">
                  Click to select a PDF file
                </p>
                <p className="text-xs text-text-tertiary mt-1">
                  or drag and drop here
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>

              {isLoading && (
                <div className="text-center py-2">
                  <div className="inline-block w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-text-tertiary mt-2">Inserting pages...</p>
                </div>
              )}

              {error && (
                <p className="text-xs text-destructive text-center">{error}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {mode === "blank" && (
          <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleInsertBlank}
              className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors flex items-center gap-1.5"
            >
              <Plus size={14} />
              Insert Page
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
