import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  SerializableTextObject,
  SerializableImageObject,
  ImageObjectInput,
  AnnotationObject,
  SelectedObject,
} from './documentStore';

interface ObjectsState {
  textObjects: SerializableTextObject[];
  imageObjects: SerializableImageObject[];
  clipboard: SerializableTextObject[];
  annotations: AnnotationObject[];

  // Text object actions
  setTextObjects: (objects: SerializableTextObject[]) => void;
  addTextObject: (obj: SerializableTextObject) => void;
  removeTextObject: (id: string) => void;
  updateTextObject: (id: string, updates: Partial<SerializableTextObject>) => void;

  // Image object actions
  setImageObjects: (objects: SerializableImageObject[]) => void;
  addImageObject: (obj: ImageObjectInput) => void;
  removeImageObject: (id: string) => void;
  updateImageObject: (id: string, updates: Partial<SerializableImageObject>) => void;

  // Annotation actions
  setAnnotations: (annotations: AnnotationObject[]) => void;
  addAnnotation: (annotation: AnnotationObject) => void;
  removeAnnotation: (id: string) => void;
  updateAnnotation: (id: string, updates: Partial<AnnotationObject>) => void;

  // Clipboard actions
  copySelected: () => void;
  pasteClipboard: () => void;
  duplicateSelected: () => void;

  // Re-index all objects when a page is deleted
  reindexPage: (deletedIndex: number) => void;
}

const initialState = {
  textObjects: [] as SerializableTextObject[],
  imageObjects: [] as SerializableImageObject[],
  clipboard: [] as SerializableTextObject[],
  annotations: [] as AnnotationObject[],
};

/** Access stores lazily to avoid circular dependency at import time */
const getStores = () => {
  const { useDocumentStore } = require('./documentStore');
  const { useSelectionStore } = require('./selectionStore');
  const { useHistoryStore } = require('./historyStore');
  return { useDocumentStore, useSelectionStore, useHistoryStore };
};

export const useObjectsStore = create<ObjectsState>()(
  immer((set, get) => ({
    ...initialState,

    // ── Text object actions ──────────────────────────────────
    setTextObjects: (objects) =>
      set((state) => {
        state.textObjects = objects;
      }),
    addTextObject: (obj) =>
      set((state) => {
        state.textObjects.push(obj);
        getStores().useDocumentStore.getState().setDirty(true);
      }),
    removeTextObject: (id) =>
      set((state) => {
        state.textObjects = state.textObjects.filter((o) => o.id !== id);
        getStores().useSelectionStore.getState().removeFromSelection(id);
        getStores().useDocumentStore.getState().setDirty(true);
      }),
    updateTextObject: (id, updates) =>
      set((state) => {
        const idx = state.textObjects.findIndex((o) => o.id === id);
        if (idx !== -1) {
          state.textObjects[idx] = { ...state.textObjects[idx], ...updates } as SerializableTextObject;
          getStores().useDocumentStore.getState().setDirty(true);
        }
      }),

    // ── Image object actions ─────────────────────────────────
    setImageObjects: (objects: SerializableImageObject[]) =>
      set((state) => {
        state.imageObjects = objects;
      }),
    addImageObject: (obj) =>
      set((state) => {
        state.imageObjects.push({ ...obj, opacity: obj.opacity ?? 1 });
        getStores().useDocumentStore.getState().setDirty(true);
      }),
    removeImageObject: (id) =>
      set((state) => {
        state.imageObjects = state.imageObjects.filter((o) => o.id !== id);
        getStores().useSelectionStore.getState().removeFromSelection(id);
        getStores().useDocumentStore.getState().setDirty(true);
      }),
    updateImageObject: (id, updates) =>
      set((state) => {
        const idx = state.imageObjects.findIndex((o) => o.id === id);
        if (idx !== -1) {
          state.imageObjects[idx] = { ...state.imageObjects[idx], ...updates } as SerializableImageObject;
          getStores().useDocumentStore.getState().setDirty(true);
        }
      }),

    // ── Annotation actions ───────────────────────────────────
    setAnnotations: (annotations: AnnotationObject[]) =>
      set((state) => {
        state.annotations = annotations;
      }),
    addAnnotation: (annotation: AnnotationObject) =>
      set((state) => {
        state.annotations.push(annotation);
        getStores().useDocumentStore.getState().setDirty(true);
      }),
    removeAnnotation: (id: string) =>
      set((state) => {
        state.annotations = state.annotations.filter((a: AnnotationObject) => a.id !== id);
        getStores().useSelectionStore.getState().removeFromSelection(id);
        getStores().useDocumentStore.getState().setDirty(true);
      }),
    updateAnnotation: (id, updates) =>
      set((state) => {
        const idx = state.annotations.findIndex((a) => a.id === id);
        if (idx !== -1) {
          state.annotations[idx] = { ...state.annotations[idx], ...updates } as AnnotationObject;
          getStores().useDocumentStore.getState().setDirty(true);
        }
      }),

    // ── Clipboard actions ────────────────────────────────────
    copySelected: () =>
      set((state) => {
        const { useSelectionStore } = getStores();
        const selected = useSelectionStore.getState().selectedObjects.filter((o: SelectedObject) => o.type === 'text');
        state.clipboard = selected
          .map((sel: SelectedObject) => state.textObjects.find((t: SerializableTextObject) => t.id === sel.id))
          .filter(Boolean) as SerializableTextObject[];

        // Also copy to system clipboard for OS-level paste support (R85)
        const textToCopy = selected
          .map((item: SelectedObject) => {
            const textObj = state.textObjects.find((t: SerializableTextObject) => t.id === item.id);
            return textObj?.content ?? '';
          })
          .filter(Boolean)
          .join('\n');
        if (textToCopy && typeof navigator !== 'undefined' && navigator.clipboard) {
          navigator.clipboard.writeText(textToCopy).catch(() => {});
        }
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

        // Add to selection
        const { useSelectionStore } = getStores();
        newObjs.forEach((obj) => {
          useSelectionStore.getState().addToSelection({ id: obj.id, type: 'text', pageIndex: obj.pageIndex });
        });

        // Push history entries
        const { useHistoryStore } = getStores();
        newObjs.forEach((obj) => {
          useHistoryStore.getState().push({
            label: 'Paste text',
            targetIds: [obj.id],
            type: 'text-add',
            objectData: obj,
          });
        });

        getStores().useDocumentStore.getState().setDirty(true);
      }),
    duplicateSelected: () =>
      set((state) => {
        const { useSelectionStore } = getStores();
        const selected = useSelectionStore.getState().selectedObjects.filter((o: SelectedObject) => o.type === 'text');
        const toDuplicate = selected
          .map((sel: SelectedObject) => state.textObjects.find((t: SerializableTextObject) => t.id === sel.id))
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
          useSelectionStore.getState().addToSelection({ id: obj.id, type: 'text', pageIndex: obj.pageIndex });
        });
        getStores().useDocumentStore.getState().setDirty(true);
      }),

    // ── Re-index on page delete ──────────────────────────────
    reindexPage: (deletedIndex) =>
      set((state) => {
        // Re-index textObjects
        state.textObjects = state.textObjects
          .filter((o) => o.pageIndex !== deletedIndex)
          .map((o) => ({
            ...o,
            pageIndex: o.pageIndex > deletedIndex ? o.pageIndex - 1 : o.pageIndex,
          }));
        // Re-index imageObjects
        state.imageObjects = state.imageObjects
          .filter((o) => o.pageIndex !== deletedIndex)
          .map((o) => ({
            ...o,
            pageIndex: o.pageIndex > deletedIndex ? o.pageIndex - 1 : o.pageIndex,
          }));
        // Re-index annotations
        state.annotations = state.annotations
          .filter((a) => a.pageIndex !== deletedIndex)
          .map((a) => ({
            ...a,
            pageIndex: a.pageIndex > deletedIndex ? a.pageIndex - 1 : a.pageIndex,
          }));
      }),
  }))
);