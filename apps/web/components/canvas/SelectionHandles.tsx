'use client';
import { useState } from 'react';
import type { BoundingBox } from '@pagecraft/pdf-engine';

interface SelectionHandlesProps {
  bbox: BoundingBox;
  onResize: (handle: string, dx: number, dy: number) => void;
  onRotateStart: (degrees: number) => void;
  onRotateMove: (degrees: number) => void;
}

export function SelectionHandles({ bbox, onResize, onRotateStart, onRotateMove }: SelectionHandlesProps) {
  const { x, y, width, height } = bbox;

  // Rotation drag state
  const [rotating, setRotating] = useState(false);
  const [rotateStartAngle, setRotateStartAngle] = useState(0);
  const [rotateStartDeg, setRotateStartDeg] = useState(0);

  // Resize drag state
  const [resizing, setResizing] = useState(false);
  const [resizeStartPos, setResizeStartPos] = useState({ x: 0, y: 0 });
  const [activeHandle, setActiveHandle] = useState<string | null>(null);

  const handles = [
    { id: 'nw', cx: x, cy: y, cursor: 'nw-resize' },
    { id: 'ne', cx: x + width, cy: y, cursor: 'ne-resize' },
    { id: 'se', cx: x + width, cy: y + height, cursor: 'se-resize' },
    { id: 'sw', cx: x, cy: y + height, cursor: 'sw-resize' },
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

  // Rotation handlers
  const handleRotatePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setRotating(true);
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI) - 90;
    setRotateStartAngle(angle);
    setRotateStartDeg(bbox.rotation ?? 0);
    // Set capture on the SVG so pointermove/up go to SVG handlers
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onRotateStart(bbox.rotation ?? 0);
  };

  const handleRotatePointerMove = (e: React.PointerEvent) => {
    if (!rotating) return;
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI) - 90;
    const delta = angle - rotateStartAngle;
    onRotateMove(rotateStartDeg + delta);
  };

  const handleRotatePointerUp = (e: React.PointerEvent) => {
    setRotating(false);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  // Resize handlers
  const handleResizePointerDown = (e: React.PointerEvent, handleId: string) => {
    e.stopPropagation();
    e.preventDefault();
    setResizing(true);
    setActiveHandle(handleId);
    setResizeStartPos({ x: e.clientX, y: e.clientY });
    // Set capture on the SVG so pointermove/up go to SVG handlers
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleResizePointerMove = (e: React.PointerEvent) => {
    if (!resizing || !activeHandle) return;
    const dx = e.clientX - resizeStartPos.x;
    const dy = e.clientY - resizeStartPos.y;
    onResize(activeHandle, dx, dy);
  };

  const handleResizePointerUp = (e: React.PointerEvent) => {
    setResizing(false);
    setActiveHandle(null);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ overflow: 'visible', width: 0, height: 0, position: 'absolute' }}
      onPointerMove={(e) => {
        if (rotating) handleRotatePointerMove(e);
        else handleResizePointerMove(e);
      }}
      onPointerUp={(e) => {
        if (rotating) handleRotatePointerUp(e);
        else handleResizePointerUp(e);
      }}
    >
      {/* Selection border */}
      <rect
        x={x} y={y} width={width} height={height}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.5}
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
          onPointerDown={(e) => handleResizePointerDown(e, h.id)}
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
        onPointerDown={handleRotatePointerDown}
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
