import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { PdfDocument } from '@pagecraft/pdf-engine';
import { useUIStore } from './uiStore';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfJsDocumentProxy = any;

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
  | 'line'
  | 'stamp';

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
  strokeWidth?: number;
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

export interface StampAnnotation extends BaseAnnotation {
  type: 'stamp';
  label: string;
  backgroundColor: string;
}

export type AnnotationObject =
  | HighlightAnnotation
  | LineAnnotation
  | StickyAnnotation
  | CommentAnnotation
  | DrawingAnnotation
  | ShapeAnnotation
  | StampAnnotation;

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
  objectRef?: string; // optional — image objects are user-added, not parsed from PDF
}

// Shape for construction — objectRef defaults to '' for user-added images
export type ImageObjectInput = {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  src: string;
  opacity?: number;
  objectRef?: string;
};

export interface SelectedObject {
  id: string;
  type: 'text' | 'image' | 'annotation';
  pageIndex: number;
}

export interface DocumentState {
  pdfDocument: PdfDocument | null;
  pdfJsDoc: PdfJsDocumentProxy | null; // pdf.js document proxy for rendering
  fileName: string;
  fileSize: number;
  /** SHA-256 content hash — stable document identity for IndexedDB keys */
  docId?: string;
  isDirty: boolean;
  isLoading: boolean;
  saveStatus: 'idle' | 'saving' | 'saved' | 'offline';
  lastSavedAt: number | null;
  activePageIndex: number;
  reloadTrigger: number; // incremented to force full pdf.js reload (all pages)
  // Per-page targeted reload: pageIndex → timestamp (epoch ms)
  // When a page is edited, set the timestamp; when it changes, re-render only that page.
  // NOTE: After the canvas picks up targetedReloads[pageIndex] it should call
  // clearPartialReload(pageIndex) to avoid stale-entry accumulation.
  targetedReloads: Record<number, number>;
  // Parsing progress (0-100) — updated during parseAllPages so UI can show "Parsing X of Y"
  parsingProgress: number;

  // Actions
  setDocument: (doc: PdfDocument | null, fileName?: string, fileSize?: number, docId?: string) => void;
  setPdfJsDoc: (doc: PdfJsDocumentProxy | null) => void;
  setLoading: (loading: boolean) => void;
  setDirty: (dirty: boolean) => void;
  setSaveStatus: (status: 'idle' | 'saving' | 'saved' | 'offline') => void;
  setLastSavedAt: (timestamp: number | null) => void;
  setActivePage: (index: number) => void;
  setParsingProgress: (progress: number) => void;
  forceReload: () => void;
  /** Reload the document from a raw ArrayBuffer (used by conflict resolution to reload external changes) */
  reloadFromBuffer: (buffer: ArrayBuffer, fileName?: string, fileSize?: number) => Promise<void>;
  addPartialReload: (pageIndex: number) => void;
  /** Clears the targeted reload timestamp for the given page after the canvas consumes it. (#27) */
  clearPartialReload: (pageIndex: number) => void;
  reset: () => void;
  // Page management
  addPage: (afterIndex?: number, size?: { width: number; height: number }) => void;
  deletePage: (index: number) => void;
  duplicatePage: (index: number) => void;
  reorderPages: (fromIndex: number, toIndex: number) => void;
  rotatePage: (index: number, direction: "left" | "right") => void;
  cropPage: (index: number, bounds?: { x: number; y: number; width: number; height: number }) => void;
  insertPagesFromFile: (file: File, afterIndex: number) => Promise<number>;
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
  fileName: "Untitled.pdf",
  fileSize: 0,
  docId: undefined,
  isDirty: false,
  isLoading: false,
  saveStatus: 'idle' as const,
  lastSavedAt: null,
  activePageIndex: 0,
  reloadTrigger: 0,
  targetedReloads: {},
  parsingProgress: 0,
  formFieldValues: {},
  pendingSignature: null,
};

/** Compute SHA-256 hash of a buffer for stable document identity */
async function computeHash(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Re-export PdfDocument type for external consumers */
export type { PdfDocument } from '@pagecraft/pdf-engine';

export const useDocumentStore = create<DocumentState>()(
  immer((set) => ({
    ...initialState,
    setDocument: (doc, fileName = "Untitled.pdf", fileSize = 0, docId) =>
      set((state) => {
        state.pdfDocument = doc;
        state.fileName = fileName;
        state.fileSize = fileSize;
        state.docId = docId;
        state.isDirty = false;
        state.saveStatus = 'idle';
        state.lastSavedAt = null;
        state.activePageIndex = 0;
        state.pdfJsDoc = null;  // clear pdf.js doc so canvases unmount
      }),
    setPdfJsDoc: (doc) =>
      set((state) => { state.pdfJsDoc = doc; }),
    setLoading: (loading) =>
      set((state) => { state.isLoading = loading; }),
    setDirty: (dirty) =>
      set((state) => { state.isDirty = dirty; }),
    setSaveStatus: (status: 'idle' | 'saving' | 'saved' | 'offline') =>
      set((state) => { state.saveStatus = status; }),
    setLastSavedAt: (timestamp: number | null) =>
      set((state) => { state.lastSavedAt = timestamp; }),
    setActivePage: (index) =>
      set((state) => {
        state.activePageIndex = index;
      }),
    setParsingProgress: (progress) =>
      set((state) => { state.parsingProgress = progress; }),
    forceReload: () =>
      set((state) => {
        state.reloadTrigger = state.reloadTrigger + 1;
        state.pdfJsDoc = null;
        state.targetedReloads = {};
      }),
    reloadFromBuffer: async (buffer: ArrayBuffer, fileName = "Untitled.pdf", fileSize = 0) => {
      // Dynamically import PdfEngine to avoid circular dependency at module load time
      const { PdfEngine } = await import('@pagecraft/pdf-engine');
      const engine = new PdfEngine();
      const doc = await engine.load(buffer);
      const docId = await computeHash(buffer);
      set((state) => {
        state.pdfDocument = doc;
        state.fileName = fileName;
        state.fileSize = fileSize;
        state.docId = docId;
        state.isDirty = false;
        state.saveStatus = 'idle';
        state.lastSavedAt = null;
        state.activePageIndex = 0;
        state.pdfJsDoc = null;
        state.reloadTrigger = state.reloadTrigger + 1;
        state.targetedReloads = {};
      });
    },
    addPartialReload: (pageIndex) =>
      set((state) => {
        state.targetedReloads[pageIndex] = Date.now();
      }),
    clearPartialReload: (pageIndex) =>
      set((state) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [pageIndex]: _removed, ...rest } = state.targetedReloads;
        state.targetedReloads = rest;
      }),
    reset: () =>
      set(() => ({ ...initialState })),

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
      if (count <= 1) {
        useUIStore.getState().setToast('Cannot delete the last page');
        return;
      }
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
        // Targeted reload for the affected region (all pages shift)
        state.targetedReloads = {};
        for (let i = 0; i < newCount; i++) {
          state.targetedReloads[i] = Date.now();
        }
      });
    },

    duplicatePage: (index) => {
      const doc = useDocumentStore.getState().pdfDocument;
      if (!doc) return;

      // Push to history before duplicating (#19)
      const { useHistoryStore } = require('./historyStore');
      useHistoryStore.getState().push({
        label: `Duplicated page ${index + 1}`,
        targetIds: [],
        type: 'page-duplicate',
        pageIndex: index,
      });

      const newPage = doc.duplicatePage(index);
      set((state) => {
        state.isDirty = true;
        state.activePageIndex = newPage.getIndex();
        // Targeted reload for the new page and the page after it (shift)
        const newCount = doc.getPageCount();
        state.targetedReloads = {};
        state.targetedReloads[index] = Date.now();
        state.targetedReloads[newPage.getIndex()] = Date.now();
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
        // Targeted reload for all pages in the affected range
        const minIdx = Math.min(fromIndex, toIndex);
        const maxIdx = Math.max(fromIndex, toIndex);
        state.targetedReloads = {};
        for (let i = minIdx; i <= maxIdx; i++) {
          state.targetedReloads[i] = Date.now();
        }
      });
    },

    rotatePage: (index, direction) => {
      const doc = useDocumentStore.getState().pdfDocument;
      if (!doc) return;
      const page = doc.getPage(index);
      if (!page) return;
      const currentRotation = page.getRotation();
      const delta = direction === "left" ? -90 : 90;
      const newRotation = (currentRotation + delta + 360) % 360;
      page.setRotation(newRotation); // degrees() called inside Page.setRotation()
      set((state) => {
        state.isDirty = true;
        state.targetedReloads[index] = Date.now();
      });
    },

    cropPage: (index, bounds) => {
      const doc = useDocumentStore.getState().pdfDocument;
      if (!doc) return;
      const libDoc = doc.getLibDoc();
      const page = libDoc.getPage(index);
      if (!page) return;

      // Capture previous crop box for undo before modifying (#20)
      const prevCrop = page.getCropBox?.() ?? null;
      // Push to history before cropping (#20)
      const { useHistoryStore } = require('./historyStore');
      useHistoryStore.getState().push({
        label: `Cropped page ${index + 1}`,
        targetIds: [],
        type: 'page-crop',
        pageIndex: index,
        objectData: { current: bounds, previous: prevCrop },
      });

      if (bounds) {
        // Convert DOM coords (top-left origin) to PDF coords (bottom-left origin)
        const { width: pageWidth, height: pageHeight } = page.getSize();
        const pdfX = bounds.x;
        const pdfY = pageHeight - bounds.y - bounds.height; // Convert Y from top-left to bottom-left
        page.setCropBox(pdfX, pdfY, bounds.width, bounds.height);
      }

      useDocumentStore.getState().addPartialReload(index);

      set((state) => {
        state.isDirty = true;
        state.targetedReloads[index] = Date.now();
      });
    },

    insertPagesFromFile: async (file: File, afterIndex: number): Promise<number> => {
      const doc = useDocumentStore.getState().pdfDocument;
      if (!doc) return 0;

      const count: number = await doc.insertPagesFromFile(file, afterIndex);
      if (count === 0) return 0;

      // render the newly inserted pages (not just incrementing reloadTrigger)
      set((state) => {
        state.isDirty = true;
        state.reloadTrigger += 1;
        state.pdfJsDoc = null;
      });
      return count;
    },

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
  }))
);