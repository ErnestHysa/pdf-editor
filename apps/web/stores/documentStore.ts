import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { PdfDocument } from '@pagecraft/pdf-engine';

export interface SelectedObject {
  id: string;
  type: 'text' | 'image' | 'annotation';
  pageIndex: number;
}

interface DocumentState {
  pdfDocument: PdfDocument | null;
  fileName: string;
  fileSize: number;
  isDirty: boolean;
  isLoading: boolean;
  selectedObjects: SelectedObject[];
  activePageIndex: number;

  // Actions
  setDocument: (doc: PdfDocument | null, fileName?: string, fileSize?: number) => void;
  setLoading: (loading: boolean) => void;
  setDirty: (dirty: boolean) => void;
  selectObject: (obj: SelectedObject | null) => void;
  selectObjects: (objs: SelectedObject[]) => void;
  clearSelection: () => void;
  setActivePage: (index: number) => void;
  reset: () => void;
}

const initialState = {
  pdfDocument: null,
  fileName: 'Untitled.pdf',
  fileSize: 0,
  isDirty: false,
  isLoading: false,
  selectedObjects: [],
  activePageIndex: 0,
};

export const useDocumentStore = create<DocumentState>()(
  immer((set) => ({
    ...initialState,
    setDocument: (doc, fileName = 'Untitled.pdf', fileSize = 0) =>
      set((state) => {
        state.pdfDocument = doc;
        state.fileName = fileName;
        state.fileSize = fileSize;
        state.isDirty = false;
        state.activePageIndex = 0;
        state.selectedObjects = [];
      }),
    setLoading: (loading) =>
      set((state) => { state.isLoading = loading; }),
    setDirty: (dirty) =>
      set((state) => { state.isDirty = dirty; }),
    selectObject: (obj) =>
      set((state) => {
        state.selectedObjects = obj ? [obj] : [];
      }),
    selectObjects: (objs) =>
      set((state) => {
        state.selectedObjects = objs;
      }),
    clearSelection: () =>
      set((state) => {
        state.selectedObjects = [];
      }),
    setActivePage: (index) =>
      set((state) => {
        state.activePageIndex = index;
      }),
    reset: () =>
      set(() => ({ ...initialState })),
  }))
);
