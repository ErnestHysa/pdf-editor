import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { PdfDocument } from '@pagecraft/pdf-engine';

// ── Annotation types ────────────────────────────────────────────

export type AnnotationType =
  | 'highlight'
  | 'underline'
  | 'strikethrough'
  | 'sticky'
  | 'comment'
  | 'drawing'
  | 'rectangle'
  | 'ellipse'
  | 'arrow'
  | 'line';

export interface BaseAnnotation {
  id: string;
  type: AnnotationType;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
}

export interface HighlightAnnotation extends BaseAnnotation {
  type: 'highlight';
  color: string;
  opacity: number;
}

export interface LineAnnotation extends BaseAnnotation {
  type: 'underline' | 'strikethrough';
  fontSize: number;
}

export interface StickyAnnotation extends BaseAnnotation {
  type: 'sticky';
  content: string;
  color: string;
}

export interface CommentAnnotation extends BaseAnnotation {
  type: 'comment';
  content: string;
  author: string;
  timestamp: number;
}

export interface DrawingAnnotation extends BaseAnnotation {
  type: 'drawing';
  points: Array<{ x: number; y: number }>;
  strokeWidth: number;
  imageData: string;
}

export interface ShapeAnnotation extends BaseAnnotation {
  type: 'rectangle' | 'ellipse' | 'arrow' | 'line';
  strokeWidth: number;
  filled: boolean;
}

export type AnnotationObject =
  | HighlightAnnotation
  | LineAnnotation
  | StickyAnnotation
  | CommentAnnotation
  | DrawingAnnotation
  | ShapeAnnotation;

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

/** Serializable image object for use in Zustand store */
export interface SerializableImageObject {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  src: string; // base64 data URL
  opacity: number;
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
  imageObjects: SerializableImageObject[];      // image objects added by user
  fileName: string;
  fileSize: number;
  isDirty: boolean;
  isLoading: boolean;
  selectedObjects: SelectedObject[];
  activePageIndex: number;
  reloadTrigger: number; // incremented to force pdf.js reload (e.g. after rotation)
  clipboard: SerializableTextObject[]; // copied text objects for paste
  annotations: AnnotationObject[]; // R35-R42 annotation objects

  // Actions
  setDocument: (doc: PdfDocument | null, fileName?: string, fileSize?: number) => void;
  setPdfJsDoc: (doc: PdfJsDocumentProxy | null) => void;
  setLoading: (loading: boolean) => void;
  setDirty: (dirty: boolean) => void;
  selectObject: (obj: SelectedObject | null) => void;
  selectObjects: (objs: SelectedObject[]) => void;
  clearSelection: () => void;
  copySelected: () => void;
  pasteClipboard: () => void;
  duplicateSelected: () => void;
  setActivePage: (index: number) => void;
  forceReload: () => void;
  setTextObjects: (objects: SerializableTextObject[]) => void;
  addTextObject: (obj: SerializableTextObject) => void;
  removeTextObject: (id: string) => void;
  updateTextObject: (id: string, updates: Partial<SerializableTextObject>) => void;
  addToSelection: (obj: SelectedObject) => void;
  removeFromSelection: (id: string) => void;
  reset: () => void;
  // Page management
  addPage: (afterIndex?: number, size?: { width: number; height: number }) => void;
  deletePage: (index: number) => void;
  duplicatePage: (index: number) => void;
  reorderPages: (fromIndex: number, toIndex: number) => void;
  insertPagesFromFile: (file: File, afterIndex: number) => Promise<number>;
  // Annotation management (R35-R42)
  addAnnotation: (annotation: AnnotationObject) => void;
  removeAnnotation: (id: string) => void;
  updateAnnotation: (id: string, updates: Partial<AnnotationObject>) => void;
  // Image management (R43-R47)
  addImageObject: (obj: SerializableImageObject) => void;
  removeImageObject: (id: string) => void;
  updateImageObject: (id: string, updates: Partial<SerializableImageObject>) => void;
  // Form field management (R65)
  formFieldValues: Record<string, string | boolean>; // field name -> modified value
  updateFormFieldValue: (fieldName: string, value: string | boolean) => void;
  resetFormFieldValues: () => void;
  // Pending signature (R66)
  pendingSignature: { dataUrl: string; width: number; height: number } | null;
  setPendingSignature: (sig: { dataUrl: string; width: number; height: number } | null) => void;
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
  imageObjects: [],
  clipboard: [],
  annotations: [],
  formFieldValues: {},
  pendingSignature: null,
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
    addToSelection: (obj) =>
      set((state) => {
        if (!state.selectedObjects.find((o) => o.id === obj.id)) {
          state.selectedObjects.push(obj);
        }
      }),
    removeFromSelection: (id) =>
      set((state) => {
        state.selectedObjects = state.selectedObjects.filter((o) => o.id !== id);
      }),
    reset: () =>
      set(() => ({ ...initialState, annotations: [] })),

    // ── Page Management ────────────────────────────────────────
    addPage: (afterIndex = -1, size) => {
      const doc = useDocumentStore.getState().pdfDocument;
      if (!doc) return;
      const page = doc.addPage(afterIndex, size);
      set((state) => {
        state.isDirty = true;
        state.activePageIndex = page.getIndex();
        state.reloadTrigger += 1;
      });
    },

    deletePage: (index) => {
      const doc = useDocumentStore.getState().pdfDocument;
      if (!doc) return;
      const count = doc.getPageCount();
      if (count <= 1) return;
      const currentActive = useDocumentStore.getState().activePageIndex;
      doc.removePage(index);
      set((state) => {
        state.isDirty = true;
        const newCount = doc.getPageCount();
        // Adjust active page index
        if (currentActive >= newCount) {
          state.activePageIndex = newCount - 1;
        } else if (index < currentActive) {
          state.activePageIndex = currentActive - 1;
        } else if (index === currentActive) {
          state.activePageIndex = Math.min(currentActive, newCount - 1);
        }
        // Clear selections on deleted page
        state.selectedObjects = state.selectedObjects.filter(
          (o) => o.pageIndex !== index && o.pageIndex < index
        );
        // Re-index page indices greater than deleted index
        state.selectedObjects = state.selectedObjects.map((o) => ({
          ...o,
          pageIndex: o.pageIndex > index ? o.pageIndex - 1 : o.pageIndex,
        }));
        state.reloadTrigger += 1;
      });
    },

    duplicatePage: (index) => {
      const doc = useDocumentStore.getState().pdfDocument;
      if (!doc) return;
      const newPage = doc.duplicatePage(index);
      set((state) => {
        state.isDirty = true;
        state.activePageIndex = newPage.getIndex();
        state.reloadTrigger += 1;
      });
    },

    reorderPages: (fromIndex, toIndex) => {
      const doc = useDocumentStore.getState().pdfDocument;
      if (!doc) return;
      if (fromIndex === toIndex) return;
      const currentActive = useDocumentStore.getState().activePageIndex;
      doc.reorderPages(fromIndex, toIndex);
      set((state) => {
        state.isDirty = true;
        // Update active page index to follow the moved page
        if (currentActive === fromIndex) {
          state.activePageIndex = toIndex;
        } else if (fromIndex < toIndex && currentActive > fromIndex && currentActive <= toIndex) {
          state.activePageIndex = currentActive - 1;
        } else if (fromIndex > toIndex && currentActive >= toIndex && currentActive < fromIndex) {
          state.activePageIndex = currentActive + 1;
        }
        state.reloadTrigger += 1;
      });
    },

    insertPagesFromFile: async (file, afterIndex) => {
      const { PDFDocument } = await import('pdf-lib');
      const buffer = await file.arrayBuffer();
      const sourceDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      const doc = useDocumentStore.getState().pdfDocument;
      if (!doc) return 0;

      const sourcePages = sourceDoc.getPages();
      const count = sourcePages.length;
      if (count === 0) return 0;

      // Use pdf-lib's copyPages to copy from source into our doc
      const libDoc = doc.getLibDoc();
      const indices = sourcePages.map((_, i) => i);
      const copiedPages = await libDoc.copyPages(sourceDoc, indices);

      // Insert each copied page
      for (let i = 0; i < copiedPages.length; i++) {
        const insertAt = Math.min(afterIndex + 1 + i, doc.getPageCount());
        libDoc.addPage(copiedPages[i]);
        // Also track in our pages array - we need to get the new Page wrapper
        // Since addPage adds to the end in pdf-lib, we rebuild the pages array
        // Actually, pdf-lib's addPage adds to end. For proper ordering, we'd need
        // to rebuild the whole doc. For now, let's just add to end and re-order.
      }

      set((state) => {
        state.isDirty = true;
        state.reloadTrigger += 1;
      });
      return count;
    },
    // ── Annotation management (R35-R42) ──────────────────────────
    addAnnotation: (annotation) =>
      set((state) => {
        state.annotations.push(annotation);
        state.isDirty = true;
      }),
    removeAnnotation: (id) =>
      set((state) => {
        state.annotations = state.annotations.filter((a) => a.id !== id);
        state.selectedObjects = state.selectedObjects.filter((o) => o.id !== id);
        state.isDirty = true;
      }),
    updateAnnotation: (id, updates) =>
      set((state) => {
        const idx = state.annotations.findIndex((a) => a.id === id);
        if (idx !== -1) {
          state.annotations[idx] = { ...state.annotations[idx], ...updates } as AnnotationObject;
          state.isDirty = true;
        }
      }),
    // ── Image management (R43-R47) ────────────────────────────────
    addImageObject: (obj) =>
      set((state) => {
        state.imageObjects.push(obj);
        state.isDirty = true;
      }),
    removeImageObject: (id) =>
      set((state) => {
        state.imageObjects = state.imageObjects.filter((o) => o.id !== id);
        state.selectedObjects = state.selectedObjects.filter((o) => o.id !== id);
        state.isDirty = true;
      }),
    updateImageObject: (id, updates) =>
      set((state) => {
        const idx = state.imageObjects.findIndex((o) => o.id === id);
        if (idx !== -1) {
          state.imageObjects[idx] = { ...state.imageObjects[idx], ...updates } as SerializableImageObject;
          state.isDirty = true;
        }
      }),
    // ── Form field management (R65) ────────────────────────────────
    updateFormFieldValue: (fieldName, value) =>
      set((state) => {
        state.formFieldValues[fieldName] = value;
        state.isDirty = true;
      }),
    resetFormFieldValues: () =>
      set((state) => {
        state.formFieldValues = {};
      }),
    setPendingSignature: (sig) =>
      set((state) => {
        state.pendingSignature = sig;
      }),
    copySelected: () =>
      set((state) => {
        const selected = state.selectedObjects.filter((o) => o.type === 'text');
        state.clipboard = selected
          .map((sel) => state.textObjects.find((t) => t.id === sel.id))
          .filter(Boolean) as SerializableTextObject[];
      }),
    pasteClipboard: () =>
      set((state) => {
        if (state.clipboard.length === 0) return;
        const newObjs: SerializableTextObject[] = state.clipboard.map((obj) => ({
          ...obj,
          id: `${obj.id}-copy-${Date.now()}`,
          x: obj.x + 20,
          y: obj.y + 20,
          objectRef: 'new',
        }));
        newObjs.forEach((obj) => state.textObjects.push(obj));
        state.isDirty = true;
      }),
    duplicateSelected: () =>
      set((state) => {
        const selected = state.selectedObjects.filter((o) => o.type === 'text');
        const toDuplicate = selected
          .map((sel) => state.textObjects.find((t) => t.id === sel.id))
          .filter(Boolean) as SerializableTextObject[];
        const newObjs: SerializableTextObject[] = toDuplicate.map((obj) => ({
          ...obj,
          id: `${obj.id}-dup-${Date.now()}`,
          x: obj.x + 20,
          y: obj.y + 20,
          objectRef: 'new',
        }));
        newObjs.forEach((obj) => {
          state.textObjects.push(obj);
          state.selectedObjects.push({ id: obj.id, type: 'text', pageIndex: obj.pageIndex });
        });
        state.isDirty = true;
      }),
  }))
);
