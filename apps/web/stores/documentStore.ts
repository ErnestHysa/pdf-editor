import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { PdfDocument } from '@pagecraft/pdf-engine';

/** Serializable text object for use in Zustand store */
export interface SerializableTextObject {
  id: string;
  content: string;
  pageIndex: number;
  // Position
  x: number;
  y: number;
  width: number;
  height: number;
  // Style
  fontSize: number;
  fontFamily: string;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color: string;
  textAlign: 'left' | 'center' | 'right';
  rotation: number;
  objectRef: string; // PDF object ref like "45 0 R"
}

export interface SelectedObject {
  id: string;
  type: 'text' | 'image' | 'annotation';
  pageIndex: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfJsDocumentProxy = any;

interface DocumentState {
  pdfDocument: PdfDocument | null;
  pdfJsDoc: PdfJsDocumentProxy | null; // pdf.js document proxy for rendering
  textObjects: SerializableTextObject[];       // parsed text objects from PdfParser
  fileName: string;
  fileSize: number;
  isDirty: boolean;
  isLoading: boolean;
  selectedObjects: SelectedObject[];
  activePageIndex: number;
  reloadTrigger: number; // incremented to force pdf.js reload (e.g. after rotation)

  // Actions
  setDocument: (doc: PdfDocument | null, fileName?: string, fileSize?: number) => void;
  setPdfJsDoc: (doc: PdfJsDocumentProxy | null) => void;
  setLoading: (loading: boolean) => void;
  setDirty: (dirty: boolean) => void;
  selectObject: (obj: SelectedObject | null) => void;
  selectObjects: (objs: SelectedObject[]) => void;
  clearSelection: () => void;
  setActivePage: (index: number) => void;
  forceReload: () => void;
  setTextObjects: (objects: SerializableTextObject[]) => void;
  addTextObject: (obj: SerializableTextObject) => void;
  removeTextObject: (id: string) => void;
  updateTextObject: (id: string, updates: Partial<SerializableTextObject>) => void;
  reset: () => void;
}

const initialState = {
  pdfDocument: null,
  pdfJsDoc: null,
  fileName: 'Untitled.pdf',
  fileSize: 0,
  isDirty: false,
  isLoading: false,
  selectedObjects: [],
  activePageIndex: 0,
  reloadTrigger: 0,
  textObjects: [],
};

export const useDocumentStore = create<DocumentState>()(
  immer((set) => ({
    ...initialState,
    setDocument: (doc, fileName = "Untitled.pdf", fileSize = 0) =>
      set((state) => {
        state.pdfDocument = doc;
        state.fileName = fileName;
        state.fileSize = fileSize;
        state.isDirty = false;
        state.selectedObjects = [];
        state.activePageIndex = 0;
        state.textObjects = []; // clear parsed text objects
        state.pdfJsDoc = null;  // clear pdf.js doc so canvases unmount
      }),
    setPdfJsDoc: (doc) =>
      set((state) => { state.pdfJsDoc = doc; }),
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
    forceReload: () =>
      set((state) => {
        state.reloadTrigger = state.reloadTrigger + 1;
        state.pdfJsDoc = null;
      }),
    setTextObjects: (objects) =>
      set((state) => {
        state.textObjects = objects;
      }),
    addTextObject: (obj) =>
      set((state) => {
        state.textObjects.push(obj);
        state.isDirty = true;
      }),
    removeTextObject: (id) =>
      set((state) => {
        state.textObjects = state.textObjects.filter((o) => o.id !== id);
        state.selectedObjects = state.selectedObjects.filter((o) => o.id !== id);
        state.isDirty = true;
      }),
    updateTextObject: (id: string, updates: Partial<SerializableTextObject>) =>
      set((state) => {
        const idx = state.textObjects.findIndex((o) => o.id === id);
        if (idx !== -1) {
          state.textObjects[idx] = { ...state.textObjects[idx], ...updates } as SerializableTextObject;
        }
      }),
    reset: () =>
      set(() => ({ ...initialState })),
  }))
);
