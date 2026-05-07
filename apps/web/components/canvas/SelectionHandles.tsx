'use client';
import type { BoundingBox } from '@pagecraft/pdf-engine';

interface SelectionHandlesProps {
  bbox: BoundingBox;
  onRotate: (degrees: number) => void;
}

export function SelectionHandles({ bbox, onRotate }: SelectionHandlesProps) {
  const { x, y, width, height } = bbox;
  const handles = [
    // corners
    { id: 'nw', cx: x, cy: y, cursor: 'nw-resize' },
    { id: 'ne', cx: x + width, cy: y, cursor: 'ne-resize' },
    { id: 'se', cx: x + width, cy: y + height, cursor: 'se-resize' },
    { id: 'sw', cx: x, cy: y + height, cursor: 'sw-resize' },
    // midpoints
    { id: 'n', cx: x + width / 2, cy: y, cursor: 'n-resize' },
    { id: 's', cx: x + width / 2, cy: y + height, cursor: 's-resize' },
    { id: 'e', cx: x + width, cy: y + height / 2, cursor: 'e-resize' },
    { id: 'w', cx: x, cy: y + height / 2, cursor: 'w-resize' },
  ];

  const handleSize = 8;
  const handleStyle = {
    fill: 'var(--accent)',
    stroke: 'white',
    strokeWidth: 1.5,
  };

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ overflow: 'visible', width: 0, height: 0, position: 'absolute' }}
    >
      {/* Selection border */}
      <rect
        x={x} y={y} width={width} height={height}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.5 / 1} /* will be scaled by parent */
        strokeDasharray="none"
        className="pointer-events-none"
      />

      {/* Resize handles */}
      {handles.map((h) => (
        <rect
          key={h.id}
          x={h.cx - handleSize / 2}
          y={h.cy - handleSize / 2}
          width={handleSize}
          height={handleSize}
          rx={1}
          style={handleStyle}
          className="pointer-events-all cursor-inherit"
        />
      ))}

      {/* Rotation handle */}
      <circle
        cx={x + width / 2}
        cy={y - 20}
        r={5}
        fill="var(--accent)"
        stroke="white"
        strokeWidth={1.5}
        className="pointer-events-all cursor-grab"
      />
      <line
        x1={x + width / 2} y1={y - 15}
        x2={x + width / 2} y2={y}
        stroke="var(--accent)"
        strokeWidth={1.5}
        className="pointer-events-none"
      />
    </svg>
  );
}
