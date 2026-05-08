"use client";
import { useState, useCallback } from "react";
import { X, Crop, Maximize2, RotateCcw } from "lucide-react";
import { useDocumentStore } from "@/stores/documentStore";
import { PAGE_SIZES } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface CropResizeDialogProps {
  open: boolean;
  onClose: () => void;
}

type Tab = "crop" | "resize";

export function CropResizeDialog({ open, onClose }: CropResizeDialogProps) {
  const { pdfDocument, activePageIndex, forceReload } = useDocumentStore();

  // Crop state
  const [cropTop, setCropTop] = useState(0);
  const [cropRight, setCropRight] = useState(0);
  const [cropBottom, setCropBottom] = useState(0);
  const [cropLeft, setCropLeft] = useState(0);
  const [cropScope, setCropScope] = useState<"current" | "all">("current");

  // Resize state
  const [resizeWidth, setResizeWidth] = useState(612);
  const [resizeHeight, setResizeHeight] = useState(792);
  const [resizePreset, setResizePreset] = useState<"Letter" | "A4" | "Legal" | "Custom">("Letter");
  const [resizeOrientation, setResizeOrientation] = useState<"portrait" | "landscape">("portrait");
  const [isProcessing, setIsProcessing] = useState(false);

  const [activeTab, setActiveTab] = useState<Tab>("crop");

  const handleCropApply = useCallback(async () => {
    if (!pdfDocument) return;
    setIsProcessing(true);

    try {
      const libDoc = pdfDocument.getLibDoc();
      const pages = libDoc.getPages();
      const pageCount = libDoc.getPageCount();

      if (cropScope === "current") {
        const page = pages[activePageIndex];
        const { height } = page.getSize();

        // Crop box: [left, bottom, right, top] in PDF coordinates (origin bottom-left)
        const newCropBox = [
          cropLeft,
          cropBottom,
          page.getWidth() - cropRight,
          height - cropTop,
        ] as [number, number, number, number];

        page.setCropBox(newCropBox[0], newCropBox[1], newCropBox[2], newCropBox[3]);
      } else {
        // Apply to all pages
        for (let i = 0; i < pageCount; i++) {
          const page = pages[i];
          const { height } = page.getSize();
          const newCropBox = [
            cropLeft,
            cropBottom,
            page.getWidth() - cropRight,
            height - cropTop,
          ] as [number, number, number, number];
          page.setCropBox(newCropBox[0], newCropBox[1], newCropBox[2], newCropBox[3]);
        }
      }

      forceReload();
      onClose();
    } catch (err) {
      console.error("Crop failed:", err);
    } finally {
      setIsProcessing(false);
    }
  }, [pdfDocument, cropScope, activePageIndex, cropTop, cropRight, cropBottom, cropLeft, forceReload, onClose]);

  const handleResizeApply = useCallback(async () => {
    if (!pdfDocument) return;
    setIsProcessing(true);

    try {
      const libDoc = pdfDocument.getLibDoc();
      const pages = libDoc.getPages();
      const pageCount = libDoc.getPageCount();

      // Determine target dimensions
      let targetWidth = resizeWidth;
      let targetHeight = resizeHeight;

      if (resizePreset !== "Custom") {
        const preset = PAGE_SIZES[resizePreset];
        if (resizeOrientation === "landscape") {
          targetWidth = preset.height;
          targetHeight = preset.width;
        } else {
          targetWidth = preset.width;
          targetHeight = preset.height;
        }
      }

      for (let i = 0; i < pageCount; i++) {
        const page = pages[i];
        // pdf-lib setSize sets both the media box and crop box to new dimensions
        // This is the standard resize approach for pdf-lib
        page.setSize(targetWidth, targetHeight);
      }

      forceReload();
      onClose();
    } catch (err) {
      console.error("Resize failed:", err);
    } finally {
      setIsProcessing(false);
    }
  }, [pdfDocument, resizeWidth, resizeHeight, resizePreset, resizeOrientation, forceReload, onClose]);

  const handlePresetChange = useCallback((preset: "Letter" | "A4" | "Legal" | "Custom") => {
    setResizePreset(preset);
    if (preset !== "Custom") {
      const size = PAGE_SIZES[preset];
      if (resizeOrientation === "portrait") {
        setResizeWidth(size.width);
        setResizeHeight(size.height);
      } else {
        setResizeWidth(size.height);
        setResizeHeight(size.width);
      }
    }
  }, [resizeOrientation]);

  const handleOrientationToggle = useCallback(() => {
    const newOrientation = resizeOrientation === "portrait" ? "landscape" : "portrait";
    setResizeOrientation(newOrientation);
    setResizeWidth(resizeHeight);
    setResizeHeight(resizeWidth);
  }, [resizeOrientation, resizeWidth, resizeHeight]);

  if (!open) return null;

  const tabs: { id: Tab; label: string; icon: typeof Crop }[] = [
    { id: "crop", label: "Crop", icon: Crop },
    { id: "resize", label: "Resize", icon: Maximize2 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-bg-elevated border border-border rounded-xl shadow-2xl w-[440px] animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary">Crop & Resize</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-hover text-text-tertiary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm transition-colors relative",
                activeTab === tab.id
                  ? "text-accent"
                  : "text-text-tertiary hover:text-text-secondary"
              )}
            >
              <tab.icon size={14} />
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5">
          {activeTab === "crop" && (
            <div className="space-y-4">
              <p className="text-xs text-text-tertiary">
                Enter margins to remove from each side (in points). 1 inch = 72 points.
              </p>

              {/* Crop margin inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-tertiary uppercase tracking-wider block mb-1">
                    Top
                  </label>
                  <input
                    type="number"
                    value={cropTop}
                    onChange={(e) => setCropTop(Math.max(0, Number(e.target.value)))}
                    min={0}
                    className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary"
                  />
                </div>
                <div>
                  <label className="text-xs text-text-tertiary uppercase tracking-wider block mb-1">
                    Right
                  </label>
                  <input
                    type="number"
                    value={cropRight}
                    onChange={(e) => setCropRight(Math.max(0, Number(e.target.value)))}
                    min={0}
                    className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary"
                  />
                </div>
                <div>
                  <label className="text-xs text-text-tertiary uppercase tracking-wider block mb-1">
                    Bottom
                  </label>
                  <input
                    type="number"
                    value={cropBottom}
                    onChange={(e) => setCropBottom(Math.max(0, Number(e.target.value)))}
                    min={0}
                    className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary"
                  />
                </div>
                <div>
                  <label className="text-xs text-text-tertiary uppercase tracking-wider block mb-1">
                    Left
                  </label>
                  <input
                    type="number"
                    value={cropLeft}
                    onChange={(e) => setCropLeft(Math.max(0, Number(e.target.value)))}
                    min={0}
                    className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary"
                  />
                </div>
              </div>

              {/* Scope */}
              <div>
                <label className="text-xs text-text-tertiary uppercase tracking-wider block mb-2">
                  Apply to
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCropScope("current")}
                    className={cn(
                      "flex-1 px-3 py-2 text-sm rounded-lg border transition-colors",
                      cropScope === "current"
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border hover:border-border-strong text-text-secondary"
                    )}
                  >
                    Current Page
                  </button>
                  <button
                    onClick={() => setCropScope("all")}
                    className={cn(
                      "flex-1 px-3 py-2 text-sm rounded-lg border transition-colors",
                      cropScope === "all"
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border hover:border-border-strong text-text-secondary"
                    )}
                  >
                    All Pages
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "resize" && (
            <div className="space-y-4">
              {/* Presets */}
              <div>
                <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider block mb-2">
                  Page Size
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["Letter", "A4", "Legal"] as const).map((size) => (
                    <button
                      key={size}
                      onClick={() => handlePresetChange(size)}
                      className={cn(
                        "px-3 py-2 text-sm rounded-lg border transition-colors",
                        resizePreset === size
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border hover:border-border-strong text-text-secondary"
                      )}
                    >
                      {size}
                    </button>
                  ))}
                  <button
                    onClick={() => handlePresetChange("Custom")}
                    className={cn(
                      "px-3 py-2 text-sm rounded-lg border transition-colors",
                      resizePreset === "Custom"
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border hover:border-border-strong text-text-secondary"
                    )}
                  >
                    Custom
                  </button>
                </div>
              </div>

              {/* Custom dimensions */}
              {resizePreset === "Custom" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-text-tertiary uppercase tracking-wider block mb-1">
                      Width (pt)
                    </label>
                    <input
                      type="number"
                      value={resizeWidth}
                      onChange={(e) => {
                        setResizeWidth(Number(e.target.value));
                        setResizePreset("Custom");
                      }}
                      min={72}
                      max={14400}
                      className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-tertiary uppercase tracking-wider block mb-1">
                      Height (pt)
                    </label>
                    <input
                      type="number"
                      value={resizeHeight}
                      onChange={(e) => {
                        setResizeHeight(Number(e.target.value));
                        setResizePreset("Custom");
                      }}
                      min={72}
                      max={14400}
                      className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary"
                    />
                  </div>
                </div>
              )}

              {/* Orientation toggle */}
              <div>
                <label className="text-xs text-text-tertiary uppercase tracking-wider block mb-2">
                  Orientation
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (resizeOrientation === "landscape") {
                        handleOrientationToggle();
                      }
                    }}
                    disabled={resizeOrientation === "portrait"}
                    className={cn(
                      "flex-1 px-3 py-2 text-sm rounded-lg border transition-colors flex items-center justify-center gap-2",
                      resizeOrientation === "portrait"
                        ? "border-accent bg-accent/10 text-accent cursor-default"
                        : "border-border hover:border-border-strong text-text-secondary"
                    )}
                  >
                    <RotateCcw size={14} className={resizeOrientation !== "portrait" ? "opacity-50" : ""} />
                    Portrait
                  </button>
                  <button
                    onClick={() => {
                      if (resizeOrientation === "portrait") {
                        handleOrientationToggle();
                      }
                    }}
                    disabled={resizeOrientation === "landscape"}
                    className={cn(
                      "flex-1 px-3 py-2 text-sm rounded-lg border transition-colors flex items-center justify-center gap-2",
                      resizeOrientation === "landscape"
                        ? "border-accent bg-accent/10 text-accent cursor-default"
                        : "border-border hover:border-border-strong text-text-secondary"
                    )}
                  >
                    <RotateCcw size={14} className={resizeOrientation !== "landscape" ? "opacity-50" : ""} />
                    Landscape
                  </button>
                </div>
              </div>

              {resizePreset !== "Custom" && (
                <p className="text-xs text-text-tertiary">
                  {resizeWidth} × {resizeHeight} pt
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={activeTab === "crop" ? handleCropApply : handleResizeApply}
            disabled={isProcessing || !pdfDocument}
            className={cn(
              "px-4 py-2 text-sm bg-accent text-white rounded-lg font-medium transition-colors flex items-center gap-1.5",
              isProcessing || !pdfDocument ? "opacity-50 cursor-not-allowed" : "hover:bg-accent-hover"
            )}
          >
            {isProcessing ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              <>Apply</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}