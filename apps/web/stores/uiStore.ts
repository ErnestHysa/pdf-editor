import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { DEFAULT_ZOOM, ZOOM_MIN, ZOOM_MAX } from '@/lib/constants';

type Theme = 'dark' | 'light';

interface UIState {
  theme: Theme;
  zoom: number;
  panOffset: { x: number; y: number };
  leftSidebarOpen: boolean;
  rightPanelOpen: boolean;
  activePanel: 'pages' | 'properties' | 'comments';
  commandPaletteOpen: boolean;
  exportDialogOpen: boolean;
  insertPageDialogOpen: boolean;
  insertPageDialogMode: "blank" | "file";
  mobileBottomSheetOpen: boolean;
  mobileBottomSheetMode: 'pages' | 'properties' | 'tool-options';
  toast: string | null;
  searchOpen: boolean;

  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setPanOffset: (offset: { x: number; y: number }) => void;
  toggleLeftSidebar: () => void;
  toggleRightPanel: () => void;
  setActivePanel: (panel: UIState['activePanel']) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setExportDialogOpen: (open: boolean) => void;
  setInsertPageDialog: (open: boolean, mode?: UIState['insertPageDialogMode']) => void;
  setMobileBottomSheet: (open: boolean, mode?: UIState['mobileBottomSheetMode']) => void;
  setToast: (msg: string | null) => void;
  setSearchOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  immer((set) => ({
    theme: 'dark',
    zoom: DEFAULT_ZOOM,
    panOffset: { x: 0, y: 0 },
    leftSidebarOpen: true,
    rightPanelOpen: true,
    activePanel: 'pages',
    commandPaletteOpen: false,
    exportDialogOpen: false,
    insertPageDialogOpen: false,
    insertPageDialogMode: 'blank',
    mobileBottomSheetOpen: false,
    mobileBottomSheetMode: 'pages',
    toast: null,
    searchOpen: false,

    setTheme: (theme) =>
      set((state) => {
        state.theme = theme;
        if (typeof document !== 'undefined') {
          document.documentElement.classList.toggle('light', theme === 'light');
        }
      }),

    toggleTheme: () =>
      set((state) => {
        const next = state.theme === 'dark' ? 'light' : 'dark';
        state.theme = next;
        if (typeof document !== 'undefined') {
          document.documentElement.classList.toggle('light', next === 'light');
        }
      }),

    setZoom: (zoom) =>
      set((state) => {
        state.zoom = Math.min(Math.max(zoom, ZOOM_MIN), ZOOM_MAX);
      }),

    zoomIn: () =>
      set((state) => {
        state.zoom = Math.min(state.zoom + 0.1, ZOOM_MAX);
      }),

    zoomOut: () =>
      set((state) => {
        state.zoom = Math.max(state.zoom - 0.1, ZOOM_MIN);
      }),

    setPanOffset: (offset) =>
      set((state) => {
        state.panOffset = offset;
      }),

    toggleLeftSidebar: () =>
      set((state) => {
        state.leftSidebarOpen = !state.leftSidebarOpen;
      }),

    toggleRightPanel: () =>
      set((state) => {
        state.rightPanelOpen = !state.rightPanelOpen;
      }),

    setActivePanel: (panel) =>
      set((state) => {
        state.activePanel = panel;
      }),

    setCommandPaletteOpen: (open) =>
      set((state) => {
        state.commandPaletteOpen = open;
      }),

    setExportDialogOpen: (open) =>
      set((state) => {
        state.exportDialogOpen = open;
      }),

    setInsertPageDialog: (open, mode) =>
      set((state) => {
        state.insertPageDialogOpen = open;
        if (mode) state.insertPageDialogMode = mode;
      }),

    setMobileBottomSheet: (open, mode) =>
      set((state) => {
        state.mobileBottomSheetOpen = open;
        if (mode) state.mobileBottomSheetMode = mode;
      }),

    setToast: (msg) =>
      set((state) => {
        state.toast = msg;
      }),
  setSearchOpen: (open: boolean) =>
      set((state) => {
        state.searchOpen = open;
      }),
}))
);
