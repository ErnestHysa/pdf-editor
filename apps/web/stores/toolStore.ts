import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { ToolId } from '@/lib/constants';

export interface ToolOptions {
  // Common
  color: string;
  opacity: number;
  // Text
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textAlign?: 'left' | 'center' | 'right';
  textColor?: string;
  // Shape
  strokeWidth?: number;
  fillColor?: string;
  // Highlight
  highlightColor?: string;
  // Draw
  brushSize?: number;
  // Sticky note
  stickyColor?: string;
}

interface ToolState {
  activeTool: ToolId;
  toolOptions: ToolOptions;
  isDrawing: boolean;

  setTool: (tool: ToolId) => void;
  setToolOption: <K extends keyof ToolOptions>(key: K, value: ToolOptions[K]) => void;
  setDrawing: (drawing: boolean) => void;
  resetToolOptions: () => void;
}

const defaultOptions: ToolOptions = {
  color: '#C97B3E',
  opacity: 1,
  fontSize: 14,
  fontFamily: 'DM Sans',
  fontWeight: 'normal',
  fontStyle: 'normal',
  textAlign: 'left',
  textColor: '#F0EDE8',
  strokeWidth: 2,
  fillColor: 'transparent',
  highlightColor: '#C97B3E',
  brushSize: 2,
  stickyColor: '#FFEB3B',
};

export const useToolStore = create<ToolState>()(
  immer((set) => ({
    activeTool: 'select',
    toolOptions: { ...defaultOptions },
    isDrawing: false,

    setTool: (tool) =>
      set((state) => {
        state.activeTool = tool;
      }),

    setToolOption: (key, value) =>
      set((state) => {
        (state.toolOptions as Record<string, unknown>)[key] = value;
      }),

    setDrawing: (drawing) =>
      set((state) => {
        state.isDrawing = drawing;
      }),

    resetToolOptions: () =>
      set((state) => {
        state.toolOptions = { ...defaultOptions };
      }),
  }))
);
