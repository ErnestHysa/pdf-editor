"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { X, Trash2, Upload, Pen, Type, Image } from "lucide-react";
import { cn } from "@/lib/utils";

interface SignaturePadProps {
  open: boolean;
  onClose: () => void;
  onSave: (dataUrl: string, width: number, height: number) => void;
}

type Tab = "draw" | "type" | "upload";

export function SignaturePad({ open, onClose, onSave }: SignaturePadProps) {
  const [activeTab, setActiveTab] = useState<Tab>("draw");
  const [typedText, setTypedText] = useState("");
  const [fontSize, setFontSize] = useState(48);
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Focus trap: restore focus on close
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      // Focus first focusable element in dialog
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      focusable?.[0]?.focus();
    } else {
      previousFocusRef.current?.focus();
    }
  }, [open]);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);

    // Style
    ctx.strokeStyle = "#F0EDE8";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
  }, []);

  if (!open) return null;

  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    isDrawingRef.current = true;
    const rect = canvas.getBoundingClientRect();

    let x: number, y: number;
    if ("touches" in e) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    lastPosRef.current = { x, y };
  }, []);

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    let x: number, y: number;

    if ("touches" in e) {
      e.preventDefault();
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(x, y);
    ctx.stroke();

    lastPosRef.current = { x, y };
  }, []);

  const stopDrawing = useCallback(() => {
    isDrawingRef.current = false;
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setUploadedPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      // Build data URL based on active tab
      if (activeTab === "draw") {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dataUrl = canvas.toDataURL("image/png");
        onSave(dataUrl, canvas.width / 2, canvas.height / 2);
      } else if (activeTab === "type") {
        // Render typed text to canvas
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = 400;
        canvas.height = 150;

        ctx.fillStyle = "transparent";
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = "#F0EDE8";
        ctx.font = `${fontSize}px "Brush Script MT", "Segoe Script", cursive, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(typedText || "Your Signature", canvas.width / 2, canvas.height / 2);

        onSave(canvas.toDataURL("image/png"), canvas.width, canvas.height);
      } else if (activeTab === "upload") {
        if (uploadedPreview) {
          // Get natural dimensions synchronously using createImageBitmap
          const blob = await fetch(uploadedPreview).then((r) => r.blob());
          const bitmap = await createImageBitmap(blob);
          onSave(uploadedPreview, bitmap.width, bitmap.height);
          bitmap.close();
        }
      }
    } finally {
      setIsSaving(false);
    }
  }, [activeTab, typedText, fontSize, uploadedPreview, onSave, isSaving]);

  const tabs: { id: Tab; label: string; icon: typeof Pen }[] = [
    { id: "draw", label: "Draw", icon: Pen },
    { id: "type", label: "Type", icon: Type },
    { id: "upload", label: "Upload", icon: Image },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Add Signature"
        className="relative bg-bg-elevated border border-border rounded-xl shadow-2xl w-[480px] animate-scale-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary">Add Signature</h2>
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
          {activeTab === "draw" && (
            <div className="space-y-3">
              <div className="relative bg-bg-surface border border-border rounded-lg overflow-hidden">
                <canvas
                  ref={canvasRef}
                  className="w-full h-40 cursor-crosshair touch-none"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <span className="text-xs text-text-tertiary">Draw your signature here</span>
                </div>
              </div>
              <button
                onClick={clearCanvas}
                className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                <Trash2 size={14} />
                Clear
              </button>
            </div>
          )}

          {activeTab === "type" && (
            <div className="space-y-4">
              <div
                className="min-h-[100px] flex items-center justify-center bg-bg-surface border border-border rounded-lg p-4"
                style={{ fontSize: `${fontSize}px`, fontFamily: "'Brush Script MT', 'Segoe Script', cursive, sans-serif" }}
              >
                <span className="text-text-primary text-center">
                  {typedText || <span className="text-text-tertiary italic">Your Signature</span>}
                </span>
              </div>
              <input
                type="text"
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                placeholder="Type your name"
                className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary"
              />
              <div>
                <label className="text-xs text-text-tertiary uppercase tracking-wider block mb-2">
                  Font Size: {fontSize}px
                </label>
                <input
                  type="range"
                  min={24}
                  max={96}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="w-full accent-accent"
                />
              </div>
            </div>
          )}

          {activeTab === "upload" && (
            <div className="space-y-4">
              <div
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-accent transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadedPreview ? (
                  <img
                    src={uploadedPreview}
                    alt="Signature preview"
                    className="max-h-40 mx-auto object-contain"
                  />
                ) : (
                  <>
                    <Upload size={32} className="mx-auto text-text-tertiary mb-3" />
                    <p className="text-sm text-text-secondary">
                      Click to upload signature image
                    </p>
                    <p className="text-xs text-text-tertiary mt-1">
                      PNG, JPG up to 2MB
                    </p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  className="hidden"
                  onChange={handleUpload}
                />
              </div>
              {uploadedPreview && (
                <button
                  onClick={() => setUploadedPreview(null)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
                >
                  <Trash2 size={14} />
                  Remove
                </button>
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
            onClick={handleSave}
            disabled={
              isSaving ||
              (activeTab === "type" && !typedText) ||
              (activeTab === "upload" && !uploadedPreview)
            }
            className={cn(
              "px-4 py-2 text-sm bg-accent text-white rounded-lg font-medium transition-colors flex items-center gap-1.5",
              isSaving ||
              (activeTab === "type" && !typedText) ||
              (activeTab === "upload" && !uploadedPreview)
                ? "opacity-50 cursor-not-allowed"
                : "hover:bg-accent-hover"
            )}
          >
            {isSaving ? "Saving…" : "Save Signature"}
          </button>
        </div>
      </div>
    </div>
  );
}