'use client';
import { useState } from 'react';
import type { BoundingBox } from '@pagecraft/pdf-engine';

interface SelectionHandlesProps {
  bbox: BoundingBox;
  onResize: (handle: string, dx: number, dy: number) => void;
  onRotateMove: (degrees: number) => void;
}

// Rotate a point (px, py) around center (cx, cy) by angleDeg degrees
function rotatePoint(px: number, py: number, cx: number, cy: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: cos * (px - cx) - sin * (py - cy) + cx,
    y: sin * (px - cx) + cos * (py - cy) + cy,
  };
}

export function SelectionHandles({ bbox, onResize, onRotateMove }: SelectionHandlesProps) {
  const { x, y, width, height, rotation = 0 } = bbox;
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  // Rotation drag state
  const [rotating, setRotating] = useState(false);
  const [rotateStartAngle, setRotateStartAngle] = useState(0);
  const [rotateStartDeg, setRotateStartDeg] = useState(0);
  const [currentRotation, setCurrentRotation] = useState(0);

  // Resize drag state
  const [resizing, setResizing] = useState(false);
  const [resizeStartPos, setResizeStartPos] = useState({ x: 0, y: 0 });
  const [activeHandle, setActiveHandle] = useState<string | null>(null);

  // Base (unrotated) handle positions
  const baseHandles = [
    { id: 'nw', cx: 0,    cy: 0    },
    { id: 'ne', cx: width, cy: 0    },
    { id: 'se', cx: width, cy: height },
    { id: 'sw', cx: 0,    cy: height },
    { id: 'n',  cx: width / 2, cy: 0    },
    { id: 's',  cx: width / 2, cy: height },
    { id: 'e',  cx: width, cy: height / 2 },
    { id: 'w',  cx: 0,    cy: height / 2 },
  ];

  // Rotate each handle position based on current object rotation
  const handles = baseHandles.map((h) => {
    const rotated = rotatePoint(h.cx, h.cy, width / 2, height / 2, rotation);
    return {
      id: h.id,
      cx: x + rotated.x,
      cy: y + rotated.y,
      cursor: getCursor(h.id, rotation),
    };
  });

  // Rotation handle position (above the top edge, rotated)
  const baseRotateHandle = { cx: width / 2, cy: -20 };
  const rotatedRotateHandle = rotatePoint(baseRotateHandle.cx, baseRotateHandle.cy, width / 2, height / 2, rotation);
  const rotateHandleCx = x + rotatedRotateHandle.x;
  const rotateHandleCy = y + rotatedRotateHandle.y;

  // Line from top-center to rotation handle (also rotated)
  const topCenter = rotatePoint(width / 2, 0, width / 2, height / 2, rotation);
  const lineX1 = x + topCenter.x;
  const lineY1 = y + topCenter.y;
  const lineX2 = rotateHandleCx;
  const lineY2 = rotateHandleCy;

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
    const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI) - 90;
    setRotateStartAngle(angle);
    setRotateStartDeg(rotation);
    setCurrentRotation(rotation);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleRotatePointerMove = (e: React.PointerEvent) => {
    if (!rotating) return;
    const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI) - 90;
    const delta = angle - rotateStartAngle;
    const newRot = rotateStartDeg + delta;
    setCurrentRotation(newRot);
    onRotateMove(newRot);
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

  // Compute arc angle for rotation feedback
  const displayAngle = rotating ? Math.round(currentRotation % 360) : null;

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
      {/* Selection border (rotated) */}
      <rect
        x={x} y={y} width={width} height={height}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.5}
        strokeDasharray="none"
        className="pointer-events-none"
        style={{ transform: `rotate(${rotation}deg)`, transformOrigin: `${centerX}px ${centerY}px` }}
      />

      {/* Rotation arc while dragging */}
      {rotating && (
        <>
          <path
            d={`M ${centerX + 30} ${centerY} A 30 30 0 0 1 ${centerX + 30 * Math.cos((currentRotation * Math.PI) / 180)} ${centerY + 30 * Math.sin((currentRotation * Math.PI) / 180)}`}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={1.5}
            strokeDasharray="3,2"
            className="pointer-events-none"
          />
          <text
            x={centerX + 40}
            y={centerY - 8}
            fill="var(--accent)"
            fontSize={11}
            fontWeight="bold"
            className="pointer-events-none"
            style={{ fontFamily: 'sans-serif' }}
          >
            {displayAngle}°
          </text>
        </>
      )}

      {/* Resize handles */}
      {handles.map((h) => (
        <rect
          key={h.id}
          x={h.cx - handleSize / 2}
          y={h.cy - handleSize / 2}
          width={handleSize}
          height={handleSize}
          rx={1}
          style={{ ...handleStyle, cursor: h.cursor }}
          className="pointer-events-all"
          onPointerDown={(e) => handleResizePointerDown(e, h.id)}
        />
      ))}

      {/* Rotation handle */}
      <circle
        cx={rotateHandleCx}
        cy={rotateHandleCy}
        r={5}
        fill="var(--accent)"
        stroke="white"
        strokeWidth={1.5}
        className="pointer-events-all cursor-grab"
        onPointerDown={handleRotatePointerDown}
      />
      <line
        x1={lineX1} y1={lineY1}
        x2={lineX2} y2={lineY2}
        stroke="var(--accent)"
        strokeWidth={1.5}
        className="pointer-events-none"
      />
    </svg>
  );
}

function getCursor(handleId: string, rotation: number): string {
  // Base cursors for unrotated state
  const base: Record<string, string> = {
    nw: 'nw-resize', ne: 'ne-resize', se: 'se-resize', sw: 'sw-resize',
    n: 'n-resize', s: 's-resize', e: 'e-resize', w: 'w-resize',
  };
  return base[handleId] ?? 'default';
}