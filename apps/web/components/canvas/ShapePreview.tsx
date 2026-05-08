'use client';

interface ShapePreviewProps {
  type: 'highlight' | 'underline' | 'strikethrough' | 'rectangle' | 'ellipse' | 'arrow' | 'line';
  preview: { x: number; y: number; width: number; height: number };
  color: string;
  strokeWidth: number;
  opacity: number;
}

export function ShapePreview({ type, preview, color, strokeWidth, opacity }: ShapePreviewProps) {
  if (type === 'highlight') {
    return (
      <div
        className="absolute pointer-events-none"
        style={{
          left: preview.x, top: preview.y,
          width: preview.width, height: preview.height,
          backgroundColor: color, opacity: opacity * 0.35,
        }}
      />
    );
  }
  if (type === 'underline' || type === 'strikethrough') {
    const isUnderline = type === 'underline';
    return (
      <div
        className="absolute pointer-events-none"
        style={{
          left: preview.x,
          top: isUnderline
            ? preview.y + preview.height - 2
            : preview.y + preview.height / 2 - 1,
          width: preview.width, height: 2,
          backgroundColor: color,
        }}
      />
    );
  }
  if (type === 'rectangle') {
    return (
      <div
        className="absolute pointer-events-none border-2"
        style={{
          left: preview.x, top: preview.y,
          width: preview.width, height: preview.height,
          borderColor: color, borderWidth: strokeWidth,
          backgroundColor: 'transparent', opacity,
        }}
      />
    );
  }
  if (type === 'ellipse') {
    return (
      <div
        className="absolute pointer-events-none"
        style={{
          left: preview.x, top: preview.y,
          width: preview.width, height: preview.height,
          border: `${strokeWidth}px solid ${color}`,
          borderRadius: '50%',
          backgroundColor: 'transparent', opacity,
        }}
      />
    );
  }
  if (type === 'line' || type === 'arrow') {
    return (
      <svg className="absolute inset-0 pointer-events-none" style={{ overflow: 'visible' }}>
        <defs>
          <marker
            id={`preview-arrowhead-${type}`}
            markerWidth="10" markerHeight="7"
            refX="9" refY="3.5" orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill={color} />
          </marker>
        </defs>
        <line
          x1={preview.x} y1={preview.y}
          x2={preview.x + preview.width} y2={preview.y + preview.height}
          stroke={color} strokeWidth={strokeWidth}
          markerEnd={type === 'arrow' ? `url(#preview-arrowhead-${type})` : undefined}
        />
      </svg>
    );
  }
  return null;
}