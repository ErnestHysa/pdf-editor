'use client';
import { useEffect, useRef, useCallback } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { clamp } from '@/lib/utils';
import { ZOOM_MIN, ZOOM_MAX } from '@/lib/constants';

interface GestureHandlers {
  onPinch?: (scale: number) => void;
  onPan?: (dx: number, dy: number) => void;
  onLongPress?: (x: number, y: number) => void;
  onDoubleTap?: (x: number, y: number) => void;
}

export function useGestures(ref: React.RefObject<HTMLElement | null>, handlers: GestureHandlers) {
  const { setZoom, zoom } = useUIStore();
  const state = useRef({
    initialDistance: 0,
    initialZoom: 1,
    lastTap: 0,
    longPressTimer: null as ReturnType<typeof setTimeout> | null,
  });

  const getDistance = (touches: TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        state.current.initialDistance = getDistance(e.touches);
        state.current.initialZoom = zoom;
        e.preventDefault();
      } else if (e.touches.length === 1) {
        // Long press detection
        const t = e.touches[0];
        state.current.longPressTimer = setTimeout(() => {
          handlers.onLongPress?.(t.clientX, t.clientY);
        }, 500);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dist = getDistance(e.touches);
        const scale = dist / state.current.initialDistance;
        const newZoom = clamp(state.current.initialZoom * scale, ZOOM_MIN, ZOOM_MAX);
        setZoom(newZoom);
        handlers.onPinch?.(scale);
        e.preventDefault();
      }

      // Cancel long press on move
      if (state.current.longPressTimer) {
        clearTimeout(state.current.longPressTimer);
        state.current.longPressTimer = null;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (state.current.longPressTimer) {
        clearTimeout(state.current.longPressTimer);
        state.current.longPressTimer = null;
      }

      // Double tap detection
      if (e.changedTouches.length === 1) {
        const now = Date.now();
        const t = e.changedTouches[0];
        if (now - state.current.lastTap < 300) {
          handlers.onDoubleTap?.(t.clientX, t.clientY);
        }
        state.current.lastTap = now;
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: false });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      if (state.current.longPressTimer) clearTimeout(state.current.longPressTimer);
    };
  }, [ref, zoom, handlers, setZoom]);
}
