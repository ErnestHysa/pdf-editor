"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import { X, Crop, Maximize2, RotateCcw } from "lucide-react";
import { useDocumentStore } from "@/stores/documentStore";
import { PAGE_SIZES } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface CropResizeDialogProps {
  open: boolean;
  onClose: () => void;
}

type Tab = "crop" | "resize";

const HANDLE_SIZE = 10;
const THUMBNAIL_WIDTH = 160;

export function CropResizeDialog({ open, onClose }: CropResizeDialogProps) {
  const { pdfDocument, activePageIndex, forceReload, pdfJsDoc } = useDocumentStore();

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

  // Dragging state
  const [dragging, setDragging] = useState<"tl" | "tc" | "tr" | "ml" | "mr" | "bl" | "bc" | "br" | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; cropTop: number; cropRight: number; cropBottom: number; cropLeft: number } | null>(null);
  const thumbnailRef = useRef<HTMLDivElement>(null);

  // Get page dimensions
  const getPageDimensions = useCallback((index: number) => {
    if (!pdfDocument) return { width: 612, height: 792 };
    const libDoc = pdfDocument.getLibDoc();
    const page = libDoc.getPage(index);
    return page.getSize();
  }, [pdfDocument]);

  const pageDimensions = getPageDimensions(activePageIndex);
  const scale = THUMBNAIL_WIDTH / pageDimensions.width;
  const thumbHeight = pageDimensions.height * scale;

  // Calculate crop region in thumbnail coordinates
  const cropRegion = {
    left: cropLeft * scale,
    top: cropTop * scale,
    right: (pageDimensions.width - cropRight) * scale,
    bottom: (pageDimensions.height - cropBottom) * scale,
  };

  // Handle drag start
  const handleDragStart = useCallback((handle: typeof dragging) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(handle);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      cropTop,
      cropRight,
      cropBottom,
      cropLeft,
    };
  }, [cropTop, cropRight, cropBottom, cropLeft]);

  // Handle drag move
  useEffect(() => {
    if (!dragging || !dragStartRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      const start = dragStartRef.current!;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const dxPt = dx / scale;
      const dyPt = -dy / scale; // Invert Y for PDF coords

      let newTop = start.cropTop;
      let newRight = start.cropRight;
      let newBottom = start.cropBottom;
      let newLeft = start.cropLeft;

      // PDF coordinate: top-left is (cropLeft, height - cropTop)
      // In thumbnail: top-left of crop region is at (cropLeft * scale, cropTop * scale)
      switch (dragging) {
        case "tl": // Top-left corner
          newLeft = Math.max(0, Math.min(start.cropLeft + dxPt, pageDimensions.width - newRight - 10));
          newTop = Math.max(0, Math.min(start.cropTop + dyPt, pageDimensions.height - newBottom - 10));
          break;
        case "tc": // Top-center
          newTop = Math.max(0, Math.min(start.cropTop + dyPt, pageDimensions.height - newBottom - 10));
          break;
        case "tr": // Top-right corner
          newRight = Math.max(0, Math.min(start.cropRight - dxPt, pageDimensions.width - newLeft - 10));
          newTop = Math.max(0, Math.min(start.cropTop + dyPt, pageDimensions.height - newBottom - 10));
          break;
        case "ml": // Middle-left
          newLeft = Math.max(0, Math.min(start.cropLeft + dxPt, pageDimensions.width - newRight - 10));
          break;
        case "mr": // Middle-right
          newRight = Math.max(0, Math.min(start.cropRight - dxPt, pageDimensions.width - newLeft - 10));
          break;
        case "bl": // Bottom-left corner
          newLeft = Math.max(0, Math.min(start.cropLeft + dxPt, pageDimensions.width - newRight - 10));
          newBottom = Math.max(0, Math.min(start.cropBottom - dyPt, pageDimensions.height - newTop - 10));
          break;
        case "bc": // Bottom-center
          newBottom = Math.max(0, Math.min(start.cropBottom - dyPt, pageDimensions.height - newTop - 10));
          break;
        case "br": // Bottom-right corner
          newRight = Math.max(0, Math.min(start.cropRight - dxPt, pageDimensions.width - newLeft - 10));
          newBottom = Math.max(0, Math.min(start.cropBottom - dyPt, pageDimensions.height - newTop - 10));
          break;
      }

      setCropTop(Math.round(newTop));
      setCropRight(Math.round(newRight));
      setCropBottom(Math.round(newBottom));
      setCropLeft(Math.round(newLeft));
    };

    const handleMouseUp = () => {
      setDragging(null);
      dragStartRef.current = null;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, scale, pageDimensions]);

  // Thumbnail canvas render
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !pdfJsDoc || activeTab !== "crop") return;

    let cancelled = false;

    pdfJsDoc.getPage(activePageIndex + 1).then((pdfPage: any) => {
      if (cancelled) return;
      const canvas = canvasRef.current!;
      const viewport = pdfPage.getViewport({ scale });

      canvas.width = THUMBNAIL_WIDTH;
      canvas.height = thumbHeight;

      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      pdfPage.render({ canvasContext: ctx, viewport } as any).promise;
    });

    return () => { cancelled = true; };
  }, [pdfJsDoc, activePageIndex, scale, thumbHeight, activeTab]);

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
      <div className="relative bg-bg-elevated border border-border rounded-xl shadow-2xl w-[520px] animate-scale-in">
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
                Drag handles to adjust crop region. Margins shown in points (1 inch = 72 pt).
              </p>

              {/* Interactive thumbnail preview */}
              <div className="flex justify-center">
                <div
                  ref={thumbnailRef}
                  className="relative border border-border rounded bg-white overflow-hidden"
                  style={{ width: THUMBNAIL_WIDTH, height: thumbHeight }}
                >
                  {/* Page thumbnail */}
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full"
                  />

                  {/* Darkened crop margins overlay */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: `linear-gradient(to bottom,
                        rgba(0,0,0,0.3) 0%,
                        rgba(0,0,0,0.3) ${cropRegion.top}px,
                        transparent ${cropRegion.top}px,
                        transparent ${cropRegion.bottom}px,
                        rgba(0,0,0,0.3) ${cropRegion.bottom}px,
                        rgba(0,0,0,0.3) 100%
                      ), linear-gradient(to right,
                        rgba(0,0,0,0.3) 0%,
                        rgba(0,0,0,0.3) ${cropRegion.left}px,
                        transparent ${cropRegion.left}px,
                        transparent ${cropRegion.right}px,
                        rgba(0,0,0,0.3) ${cropRegion.right}px,
                        rgba(0,0,0,0.3) 100%
                      )`,
                    }}
                  />

                  {/* Crop region border */}
                  <div
                    className="absolute border-2 border-accent pointer-events-none"
                    style={{
                      left: cropRegion.left,
                      top: cropRegion.top,
                      right: THUMBNAIL_WIDTH - cropRegion.right,
                      bottom: thumbHeight - cropRegion.bottom,
                    }}
                  />

                  {/* Draggable handles */}
                  {/* Top-left corner */}
                  <div
                    className="absolute bg-white border-2 border-accent cursor-nw-resize"
                    style={{
                      width: HANDLE_SIZE,
                      height: HANDLE_SIZE,
                      left: cropRegion.left - HANDLE_SIZE / 2,
                      top: cropRegion.top - HANDLE_SIZE / 2,
                    }}
                    onMouseDown={handleDragStart("tl")}
                  />
                  {/* Top-center */}
                  <div
                    className="absolute bg-white border-2 border-accent cursor-n-resize"
                    style={{
                      width: HANDLE_SIZE,
                      height: HANDLE_SIZE,
                      left: (cropRegion.left + cropRegion.right) / 2 - HANDLE_SIZE / 2,
                      top: cropRegion.top - HANDLE_SIZE / 2,
                    }}
                    onMouseDown={handleDragStart("tc")}
                  />
                  {/* Top-right corner */}
                  <div
                    className="absolute bg-white border-2 border-accent cursor-ne-resize"
                    style={{
                      width: HANDLE_SIZE,
                      height: HANDLE_SIZE,
                      left: cropRegion.right - HANDLE_SIZE / 2,
                      top: cropRegion.top - HANDLE_SIZE / 2,
                    }}
                    onMouseDown={handleDragStart("tr")}
                  />
                  {/* Middle-left */}
                  <div
                    className="absolute bg-white border-2 border-accent cursor-w-resize"
                    style={{
                      width: HANDLE_SIZE,
                      height: HANDLE_SIZE,
                      left: cropRegion.left - HANDLE_SIZE / 2,
                      top: (cropRegion.top + cropRegion.bottom) / 2 - HANDLE_SIZE / 2,
                    }}
                    onMouseDown={handleDragStart("ml")}
                  />
                  {/* Middle-right */}
                  <div
                    className="absolute bg-white border-2 border-accent cursor-e-resize"
                    style={{
                      width: HANDLE_SIZE,
                      height: HANDLE_SIZE,
                      left: cropRegion.right - HANDLE_SIZE / 2,
                      top: (cropRegion.top + cropRegion.bottom) / 2 - HANDLE_SIZE / 2,
                    }}
                    onMouseDown={handleDragStart("mr")}
                  />
                  {/* Bottom-left corner */}
                  <div
                    className="absolute bg-white border-2 border-accent cursor-sw-resize"
                    style={{
                      width: HANDLE_SIZE,
                      height: HANDLE_SIZE,
                      left: cropRegion.left - HANDLE_SIZE / 2,
                      top: cropRegion.bottom - HANDLE_SIZE / 2,
                    }}
                    onMouseDown={handleDragStart("bl")}
                  />
                  {/* Bottom-center */}
                  <div
                    className="absolute bg-white border-2 border-accent cursor-s-resize"
                    style={{
                      width: HANDLE_SIZE,
                      height: HANDLE_SIZE,
                      left: (cropRegion.left + cropRegion.right) / 2 - HANDLE_SIZE / 2,
                      top: cropRegion.bottom - HANDLE_SIZE / 2,
                    }}
                    onMouseDown={handleDragStart("bc")}
                  />
                  {/* Bottom-right corner */}
                  <div
                    className="absolute bg-white border-2 border-accent cursor-se-resize"
                    style={{
                      width: HANDLE_SIZE,
                      height: HANDLE_SIZE,
                      left: cropRegion.right - HANDLE_SIZE / 2,
                      top: cropRegion.bottom - HANDLE_SIZE / 2,
                    }}
                    onMouseDown={handleDragStart("br")}
                  />
                </div>
              </div>

              {/* Crop margin inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-tertiary uppercase tracking-wider block mb-1">
                    Top
                  </label>
                  <input
                    type="number"
                    value={cropTop}
                    onChange={(e) => setCropTop(Math.max(0, Math.round(Number(e.target.value))))}
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
                    onChange={(e) => setCropRight(Math.max(0, Math.round(Number(e.target.value))))}
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
                    onChange={(e) => setCropBottom(Math.max(0, Math.round(Number(e.target.value))))}
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
                    onChange={(e) => setCropLeft(Math.max(0, Math.round(Number(e.target.value))))}
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
