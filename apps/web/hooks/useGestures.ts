'use client';
import { useEffect, useRef, useCallback } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { clamp } from '@/lib/utils';
import { ZOOM_MIN, ZOOM_MAX } from '@/lib/constants';

interface GestureHandlers {
  onPinch?: (scale: number) => void;
  onTwoFingerPan?: (dx: number, dy: number) => void;
  onPan?: (dx: number, dy: number) => void;
  onLongPress?: (x: number, y: number) => void;
  onDoubleTap?: (x: number, y: number) => void;
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
}

export function useGestures(ref: React.RefObject<HTMLElement | null>, handlers: GestureHandlers) {
  const { setZoom, zoom, setPanOffset, panOffset } = useUIStore();
  const state = useRef({
    initialDistance: 0,
    initialZoom: 1,
    lastTap: 0,
    longPressTimer: null as ReturnType<typeof setTimeout> | null,
    lastCentroid: { x: 0, y: 0 } as { x: number; y: number } | null,
    lastSpan: 0,
    isPinching: false,
    isPanning: false,
  });

  const getDistance = (touches: TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getCentroid = (touches: TouchList) => ({
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        state.current.initialDistance = getDistance(e.touches);
        state.current.initialZoom = zoom;
        state.current.lastCentroid = getCentroid(e.touches);
        state.current.lastSpan = state.current.initialDistance;
        state.current.isPinching = false;
        state.current.isPanning = false;
        handlers.onGestureStart?.();
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
        const centroid = getCentroid(e.touches);
        const spanDelta = Math.abs(dist - state.current.lastSpan);
        const centroidDx = centroid.x - (state.current.lastCentroid?.x ?? 0);
        const centroidDy = centroid.y - (state.current.lastCentroid?.y ?? 0);

        // Distinguish pan vs pinch: if span change >> centroid movement, it's a pinch
        // Otherwise treat as two-finger pan
        if (spanDelta > 8 && !state.current.isPinching) {
          state.current.isPinching = true;
          state.current.isPanning = false;
        }

        if (state.current.isPinching) {
          const scale = dist / state.current.initialDistance;
          const newZoom = clamp(state.current.initialZoom * scale, ZOOM_MIN, ZOOM_MAX);
          setZoom(newZoom);
          handlers.onPinch?.(scale);
        } else if (state.current.isPanning || spanDelta <= 8) {
          // Two-finger pan (not a pinch)
          if (!state.current.isPanning) {
            state.current.isPanning = true;
            state.current.isPinching = false;
          }
          const newPanX = panOffset.x + centroidDx;
          const newPanY = panOffset.y + centroidDy;
          setPanOffset({ x: newPanX, y: newPanY });
          handlers.onTwoFingerPan?.(centroidDx, centroidDy);
        }

        state.current.lastCentroid = centroid;
        state.current.lastSpan = dist;
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

      // Gesture ended: all fingers lifted — reset pinch/pan state
      if (e.touches.length === 0) {
        state.current.isPinching = false;
        state.current.isPanning = false;
        state.current.lastCentroid = null;
        handlers.onGestureEnd?.();
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
  }, [ref, zoom, panOffset, handlers, setZoom, setPanOffset]);
}
