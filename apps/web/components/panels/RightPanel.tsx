"use client";
import { useState, useCallback, useEffect } from "react";
import { useUIStore } from "@/stores/uiStore";
import { useDocumentStore, type SerializableTextObject, type SerializableImageObject } from '@/stores/documentStore';
import { useToolStore, ToolOptions } from "@/stores/toolStore";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FormFieldPanel } from "./FormFieldPanel";

interface RightPanelProps {
  open: boolean;
}

export function RightPanel({ open }: RightPanelProps) {
  const { rightPanelOpen, toggleRightPanel } = useUIStore();
  const { selectedObjects, pdfDocument, forceReload, textObjects, updateTextObject, setDirty,
    imageObjects, updateImageObject, removeImageObject } = useDocumentStore();
  const { toolOptions, setToolOption } = useToolStore();

  if (!open || !rightPanelOpen) return null;

  const selection = selectedObjects.length > 0 ? selectedObjects[0] : null;
  const activePageIndex = useDocumentStore.getState().activePageIndex;
  const activePage = pdfDocument?.getPage(activePageIndex);

  // Find the selected image object from Zustand (for user-added images)
  const selectedImageObj = selection?.type === 'image'
    ? imageObjects.find((o) => o.id === selection.id)
    : undefined;

  return (
    <aside className="w-[280px] shrink-0 bg-bg-surface border-l border-border flex flex-col overflow-hidden animate-slide-in" role="complementary" aria-label="Properties panel">
      {/* Header */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-border shrink-0">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          {selection ? "Properties" : "Page"}
        </span>
        <button
          onClick={toggleRightPanel}
          className="p-1 rounded hover:bg-bg-hover text-text-tertiary"
          aria-label="Close panel"
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {!selection && activePage && (
          <>
            <PagePropertiesPanel page={activePage} onRotateDone={forceReload} />
            <FormFieldPanel />
          </>
        )}

        {selection?.type === "text" && (
          <TextPropertiesPanel
            selectedObject={
              selectedObjects.find((o) => o.id === selection.id && o.type === "text")
                ? textObjects.find((o) => o.id === selection.id)
                : undefined
            }
            onStyleChange={(updates) => {
              if (selection.id) {
                updateTextObject(selection.id, updates);
                setDirty(true);
              }
            }}
          />
        )}

        {selection?.type === "image" && selectedImageObj && (
          <ImagePropertiesPanel
            imageObject={selectedImageObj}
            toolOptions={toolOptions}
            setToolOption={setToolOption as (key: string, value: unknown) => void}
            onUpdateImage={(updates) => {
              if (selection.id) {
                updateImageObject(selection.id, updates);
                setDirty(true);
              }
            }}
            onDeleteImage={() => {
              if (selection.id) {
                removeImageObject(selection.id);
                useDocumentStore.getState().clearSelection();
                setDirty(true);
              }
            }}
            onReplaceImage={(newSrc) => {
              if (selection.id) {
                updateImageObject(selection.id, { src: newSrc });
                setDirty(true);
              }
            }}
          />
        )}

        {selection?.type === "image" && !selectedImageObj && (
          <div className="space-y-4">
            <PropertySection title="Note">
              <p className="text-xs text-text-secondary">This image is embedded in the PDF and cannot be edited directly.</p>
            </PropertySection>
          </div>
        )}

        {selection?.type === "annotation" && (
          <AnnotationPropertiesPanel
            toolOptions={toolOptions}
            setToolOption={setToolOption as (key: string, value: unknown) => void}
          />
        )}
      </div>
    </aside>
  );
}

function PagePropertiesPanel({ page, onRotateDone }: { page: any; onRotateDone: () => void }) {
  const { pdfDocument, setDirty, forceReload } = useDocumentStore();
  const [width, setWidth] = useState(Math.round(page.getWidth?.() ?? 0));
  const [height, setHeight] = useState(Math.round(page.getHeight?.() ?? 0));
  const [rotation, setRotation] = useState(page.getRotation?.() ?? 0);

  // Sync with page changes
  useEffect(() => {
    setWidth(Math.round(page.getWidth?.() ?? 0));
    setHeight(Math.round(page.getHeight?.() ?? 0));
    setRotation(page.getRotation?.() ?? 0);
  }, [page]);

  const handleResize = useCallback(() => {
    if (!page) return;
    const w = Math.max(72, Math.min(width, 14400));
    const h = Math.max(72, Math.min(height, 14400));
    page.setSize?.(w, h);
    setDirty(true);
    onRotateDone();
  }, [page, width, height, setDirty, onRotateDone]);

  const handleRotate = useCallback((deg: number) => {
    if (!page) return;
    page.setRotation?.(deg);
    setRotation(deg);
    setDirty(true);
    onRotateDone();
  }, [page, setDirty, onRotateDone]);

  return (
    <div className="space-y-4">
      <PropertySection title="Size">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-2xs text-text-tertiary uppercase tracking-wider block mb-1">Width</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
                onBlur={handleResize}
                onKeyDown={(e) => e.key === "Enter" && handleResize()}
                className="w-full bg-bg-elevated border border-border rounded px-2 py-1 text-sm font-mono text-text-primary"
                min={72} max={14400}
              />
              <span className="text-2xs text-text-tertiary">pt</span>
            </div>
          </div>
          <div>
            <label className="text-2xs text-text-tertiary uppercase tracking-wider block mb-1">Height</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
                onBlur={handleResize}
                onKeyDown={(e) => e.key === "Enter" && handleResize()}
                className="w-full bg-bg-elevated border border-border rounded px-2 py-1 text-sm font-mono text-text-primary"
                min={72} max={14400}
              />
              <span className="text-2xs text-text-tertiary">pt</span>
            </div>
          </div>
        </div>
        {/* Quick size presets */}
        <div className="grid grid-cols-2 gap-1 mt-2">
          {(["A4", "Letter", "Legal", "A5"] as const).map((size) => (
            <button
              key={size}
              onClick={() => {
                const dims = { A4: [595.28, 841.89], Letter: [612, 792], Legal: [612, 1008], A5: [420.94, 595.28] }[size];
                setWidth(Math.round(dims[0]));
                setHeight(Math.round(dims[1]));
                if (page) { page.setSize?.(dims[0], dims[1]); setDirty(true); onRotateDone(); }
              }}
              className="px-2 py-1 text-2xs rounded border border-border hover:border-accent hover:text-accent transition-colors text-text-secondary"
            >
              {size}
            </button>
          ))}
        </div>
      </PropertySection>

      <PropertySection title="Rotation">
        <div className="flex gap-1">
          {[0, 90, 180, 270].map((deg) => (
            <button
              key={deg}
              onClick={() => handleRotate(deg)}
              className={cn(
                "flex-1 py-1 text-xs rounded border transition-colors",
                rotation === deg
                  ? "border-accent text-accent bg-accent/10"
                  : "border-border hover:border-accent hover:text-accent text-text-secondary"
              )}
            >
              {deg}&deg;
            </button>
          ))}
        </div>
      </PropertySection>
    </div>
  );
}

function TextPropertiesPanel({
  selectedObject,
  onStyleChange,
}: {
  selectedObject?: SerializableTextObject;
  onStyleChange: (updates: Partial<SerializableTextObject>) => void;
}) {
  // Use selected object's style directly
  const fontSize = selectedObject?.fontSize ?? 14;
  const textColor = selectedObject?.color ?? '#F0EDE8';
  const fontWeight = selectedObject?.fontWeight ?? 'normal';
  const fontStyle = selectedObject?.fontStyle ?? 'normal';
  const textAlign = selectedObject?.textAlign ?? 'left';

  return (
    <div className="space-y-4">
      <PropertySection title="Font Size">
        <input
          type="number"
          value={fontSize}
          onChange={(e) => onStyleChange({ fontSize: parseFloat(e.target.value) })}
          className="w-full bg-bg-elevated border border-border rounded px-2 py-1 text-sm font-mono text-text-primary"
          min={6} max={200}
        />
      </PropertySection>

      <PropertySection title="Color">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={textColor}
            onChange={(e) => onStyleChange({ color: e.target.value })}
            className="w-8 h-8 rounded border border-border cursor-pointer"
          />
          <span className="text-sm font-mono text-text-secondary">{textColor}</span>
        </div>
      </PropertySection>

      <PropertySection title="Style">
        <div className="flex gap-1">
          <ToggleButton
            active={fontWeight === "bold"}
            onClick={() => onStyleChange({ fontWeight: fontWeight === "bold" ? "normal" : "bold" })}
            className="font-bold"
          >
            B
          </ToggleButton>
          <ToggleButton
            active={fontStyle === "italic"}
            onClick={() => onStyleChange({ fontStyle: fontStyle === "italic" ? "normal" : "italic" })}
            className="italic"
          >
            I
          </ToggleButton>
        </div>
      </PropertySection>

      <PropertySection title="Alignment">
        <div className="flex gap-1">
          {(["left", "center", "right"] as const).map((align) => (
            <button
              key={align}
              onClick={() => onStyleChange({ textAlign: align })}
              className={cn(
                "flex-1 py-1 text-xs rounded border transition-colors",
                textAlign === align
                  ? "border-accent text-accent bg-accent-muted"
                  : "border-border text-text-secondary hover:border-border-strong"
              )}
            >
              {align.charAt(0).toUpperCase() + align.slice(1)}
            </button>
          ))}
        </div>
      </PropertySection>
    </div>
  );
}

function ImagePropertiesPanel({
  imageObject,
  toolOptions,
  setToolOption,
  onUpdateImage,
  onDeleteImage,
  onReplaceImage,
}: {
  imageObject: SerializableImageObject;
  toolOptions: ToolOptions;
  setToolOption: any;
  onUpdateImage: (updates: Partial<SerializableImageObject>) => void;
  onDeleteImage: () => void;
  onReplaceImage: (newSrc: string) => void;
}) {
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);

  const handleReplaceImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (ev) => {
      const file = (ev.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (re) => {
        const src = re.target?.result as string;
        onReplaceImage(src);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  return (
    <div className="space-y-4">
      {/* Opacity */}
      <PropertySection title="Opacity">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0} max={1} step={0.01}
            value={imageObject.opacity ?? 1}
            onChange={(e) => onUpdateImage({ opacity: parseFloat(e.target.value) })}
            className="flex-1 accent-accent"
          />
          <span className="text-xs font-mono text-text-secondary w-8 text-right">
            {Math.round((imageObject.opacity ?? 1) * 100)}%
          </span>
        </div>
      </PropertySection>

      {/* Dimensions */}
      <PropertySection title="Dimensions">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-2xs text-text-tertiary block mb-1">W</label>
            <input
              type="number"
              value={Math.round(imageObject.width)}
              onChange={(e) => onUpdateImage({ width: Math.max(10, parseFloat(e.target.value) || 10) })}
              className="w-full bg-bg-elevated border border-border rounded px-2 py-1 text-sm font-mono text-text-primary"
              min={10}
            />
          </div>
          <div>
            <label className="text-2xs text-text-tertiary block mb-1">H</label>
            <input
              type="number"
              value={Math.round(imageObject.height)}
              onChange={(e) => onUpdateImage({ height: Math.max(10, parseFloat(e.target.value) || 10) })}
              className="w-full bg-bg-elevated border border-border rounded px-2 py-1 text-sm font-mono text-text-primary"
              min={10}
            />
          </div>
        </div>
        <div className="text-2xs text-text-tertiary mt-1 text-center">
          {Math.round(imageObject.width)} × {Math.round(imageObject.height)} pt
        </div>
      </PropertySection>

      {/* Rotation */}
      <PropertySection title="Rotation">
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={Math.round(imageObject.rotation ?? 0)}
            onChange={(e) => onUpdateImage({ rotation: parseFloat(e.target.value) || 0 })}
            className="flex-1 bg-bg-elevated border border-border rounded px-2 py-1 text-sm font-mono text-text-primary"
          />
          <span className="text-xs text-text-tertiary">°</span>
        </div>
      </PropertySection>

      {/* Replace Image */}
      <PropertySection title="Replace">
        <button
          onClick={handleReplaceImage}
          className="w-full px-3 py-1.5 text-xs rounded border border-border hover:border-accent hover:text-accent transition-colors text-text-secondary"
        >
          Choose New Image…
        </button>
      </PropertySection>

      {/* Delete Image */}
      <PropertySection title="">
        <button
          onClick={onDeleteImage}
          className="w-full px-3 py-1.5 text-xs rounded border border-red-300 text-red-500 hover:bg-red-50 transition-colors"
        >
          Delete Image
        </button>
      </PropertySection>
    </div>
  );
}

function AnnotationPropertiesPanel({ toolOptions, setToolOption }: { toolOptions: ToolOptions; setToolOption: any }) {
  const colors = ["#C97B3E", "#E05252", "#4CAF7D", "#56C2FF", "#FFC531", "#9B59B6"];

  return (
    <div className="space-y-4">
      <PropertySection title="Color">
        <div className="flex gap-1.5 flex-wrap">
          {colors.map((c) => (
            <button
              key={c}
              onClick={() => setToolOption("color", c)}
              className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
              style={{
                backgroundColor: c,
                borderColor: toolOptions.color === c ? "white" : "transparent",
              }}
              aria-label={`Select color ${c}`}
            />
          ))}
          <input
            type="color"
            value={toolOptions.color}
            onChange={(e) => setToolOption("color", e.target.value)}
            className="w-6 h-6 rounded-full border border-border cursor-pointer"
          />
        </div>
      </PropertySection>

      <PropertySection title="Opacity">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0} max={1} step={0.01}
            value={toolOptions.opacity}
            onChange={(e) => setToolOption("opacity", parseFloat(e.target.value))}
            className="flex-1 accent-accent"
          />
          <span className="text-xs font-mono text-text-secondary w-8 text-right">
            {Math.round(toolOptions.opacity * 100)}%
          </span>
        </div>
      </PropertySection>
    </div>
  );
}

function PropertySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-2xs font-medium text-text-tertiary uppercase tracking-wider block mb-2">
        {title}
      </label>
      {children}
    </div>
  );
}

function ToggleButton({
  children, active, onClick, className,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-8 h-8 rounded border text-sm transition-colors",
        active ? "border-accent text-accent bg-accent-muted" : "border-border text-text-secondary hover:border-border-strong",
        className
      )}
    >
      {children}
    </button>
  );
}
