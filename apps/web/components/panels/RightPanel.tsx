'use client';
import { useUIStore } from '@/stores/uiStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useToolStore, ToolOptions } from '@/stores/toolStore';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RightPanelProps {
  open: boolean;
}

export function RightPanel({ open }: RightPanelProps) {
  const { rightPanelOpen, toggleRightPanel } = useUIStore();
  const { selectedObjects, pdfDocument } = useDocumentStore();
  const { toolOptions, setToolOption } = useToolStore();

  if (!open || !rightPanelOpen) return null;

  const selection = selectedObjects.length > 0 ? selectedObjects[0] : null;
  const activePage = pdfDocument?.getPage(activePageIndex);
  const activePageIndex = useDocumentStore.getState().activePageIndex;

  return (
    <aside className="w-[280px] shrink-0 bg-bg-surface border-l border-border flex flex-col overflow-hidden animate-slide-in">
      {/* Header */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-border shrink-0">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          {selection ? 'Properties' : 'Page'}
        </span>
        <button
          onClick={toggleRightPanel}
          className="p-1 rounded hover:bg-bg-hover text-text-tertiary"
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {!selection && activePage && (
          <PagePropertiesPanel page={activePage} />
        )}

        {selection?.type === 'text' && (
          <TextPropertiesPanel
            toolOptions={toolOptions}
            setToolOption={setToolOption}
          />
        )}

        {selection?.type === 'image' && (
          <ImagePropertiesPanel
            toolOptions={toolOptions}
            setToolOption={setToolOption}
          />
        )}

        {selection?.type === 'annotation' && (
          <AnnotationPropertiesPanel
            toolOptions={toolOptions}
            setToolOption={setToolOption}
          />
        )}
      </div>
    </aside>
  );
}

function PagePropertiesPanel({ page }: { page: any }) {
  return (
    <div className="space-y-4">
      <PropertySection title="Size">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-2xs text-text-tertiary uppercase tracking-wider">Width</label>
            <div className="text-sm font-mono text-text-primary">{Math.round(page.getWidth())} pt</div>
          </div>
          <div>
            <label className="text-2xs text-text-tertiary uppercase tracking-wider">Height</label>
            <div className="text-sm font-mono text-text-primary">{Math.round(page.getHeight())} pt</div>
          </div>
        </div>
      </PropertySection>

      <PropertySection title="Rotation">
        <div className="flex gap-1">
          {[0, 90, 180, 270].map((deg) => (
            <button
              key={deg}
              onClick={() => page.setRotation(deg)}
              className="flex-1 py-1 text-xs rounded border border-border hover:border-accent hover:text-accent transition-colors"
            >
              {deg}°
            </button>
          ))}
        </div>
      </PropertySection>
    </div>
  );
}

function TextPropertiesPanel({ toolOptions, setToolOption }: { toolOptions: ToolOptions; setToolOption: any }) {
  return (
    <div className="space-y-4">
      <PropertySection title="Font Size">
        <input
          type="number"
          value={toolOptions.fontSize ?? 14}
          onChange={(e) => setToolOption('fontSize', parseFloat(e.target.value))}
          className="w-full bg-bg-elevated border border-border rounded px-2 py-1 text-sm font-mono text-text-primary"
          min={6} max={200}
        />
      </PropertySection>

      <PropertySection title="Color">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={toolOptions.textColor ?? '#F0EDE8'}
            onChange={(e) => setToolOption('textColor', e.target.value)}
            className="w-8 h-8 rounded border border-border cursor-pointer"
          />
          <span className="text-sm font-mono text-text-secondary">{toolOptions.textColor}</span>
        </div>
      </PropertySection>

      <PropertySection title="Style">
        <div className="flex gap-1">
          <ToggleButton
            active={toolOptions.fontWeight === 'bold'}
            onClick={() => setToolOption('fontWeight', toolOptions.fontWeight === 'bold' ? 'normal' : 'bold')}
            className="font-bold"
          >
            B
          </ToggleButton>
          <ToggleButton
            active={toolOptions.fontStyle === 'italic'}
            onClick={() => setToolOption('fontStyle', toolOptions.fontStyle === 'italic' ? 'normal' : 'italic')}
            className="italic"
          >
            I
          </ToggleButton>
        </div>
      </PropertySection>

      <PropertySection title="Alignment">
        <div className="flex gap-1">
          {(['left', 'center', 'right'] as const).map((align) => (
            <button
              key={align}
              onClick={() => setToolOption('textAlign', align)}
              className={cn(
                'flex-1 py-1 text-xs rounded border transition-colors',
                toolOptions.textAlign === align
                  ? 'border-accent text-accent bg-accent-muted'
                  : 'border-border text-text-secondary hover:border-border-strong'
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

function ImagePropertiesPanel({ toolOptions, setToolOption }: { toolOptions: ToolOptions; setToolOption: any }) {
  return (
    <div className="space-y-4">
      <PropertySection title="Opacity">
        <input
          type="range"
          min={0} max={1} step={0.01}
          value={toolOptions.opacity}
          onChange={(e) => setToolOption('opacity', parseFloat(e.target.value))}
          className="w-full accent-accent"
        />
        <span className="text-xs font-mono text-text-secondary">{Math.round(toolOptions.opacity * 100)}%</span>
      </PropertySection>
    </div>
  );
}

function AnnotationPropertiesPanel({ toolOptions, setToolOption }: { toolOptions: ToolOptions; setToolOption: any }) {
  const colors = ['#C97B3E', '#E05252', '#4CAF7D', '#56C2FF', '#FFC531', '#9B59B6'];

  return (
    <div className="space-y-4">
      <PropertySection title="Color">
        <div className="flex gap-1.5 flex-wrap">
          {colors.map((c) => (
            <button
              key={c}
              onClick={() => setToolOption('color', c)}
              className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
              style={{
                backgroundColor: c,
                borderColor: toolOptions.color === c ? 'white' : 'transparent',
              }}
            />
          ))}
        </div>
      </PropertySection>

      <PropertySection title="Opacity">
        <input
          type="range"
          min={0} max={1} step={0.01}
          value={toolOptions.opacity}
          onChange={(e) => setToolOption('opacity', parseFloat(e.target.value))}
          className="w-full accent-accent"
        />
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
  children, active, onClick, className
}: {
  children: React.ReactNode; active: boolean; onClick: () => void; className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-8 h-8 rounded border text-sm transition-colors',
        active ? 'border-accent text-accent bg-accent-muted' : 'border-border text-text-secondary hover:border-border-strong',
        className
      )}
    >
      {children}
    </button>
  );
}
