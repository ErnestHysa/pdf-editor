"use client";
import { useEffect, useRef } from "react";

export interface ContextMenuItem {
  label: string;
  action: () => void;
  disabled?: boolean;
  divider?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[160px] bg-white rounded-lg shadow-xl border border-border py-1 text-sm"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) =>
        item.divider ? (
          <div key={`div-${i}`} className="h-px bg-border my-1" />
        ) : (
          <button
            key={item.label}
            className={`w-full text-left px-4 py-2 hover:bg-accent/10 transition-colors ${
              item.disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
            }`}
            disabled={item.disabled}
            onClick={(e) => {
              e.stopPropagation();
              if (!item.disabled) {
                item.action();
                onClose();
              }
            }}
          >
            {item.label}
          </button>
        )
      )}
    </div>
  );
}
