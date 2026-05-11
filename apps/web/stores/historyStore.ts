import { create } from 'zustand';
import { useDocumentStore } from './documentStore';
import { useObjectsStore } from './objectsStore';

/**
 * Action types for serializable history.
 * Each type carries enough data to reconstruct undo/redo at hydration time.
 */
export type HistoryActionType =
  | 'text-edit'
  | 'text-add'
  | 'text-delete'
  | 'annotation-add'
  | 'annotation-delete'
  | 'annotation-update'
  | 'image-add'
  | 'image-delete'
  | 'image-update'
  | 'page-add'
  | 'page-delete'
  | 'page-duplicate'
  | 'page-reorder'
  | 'page-rotate'
  | 'page-crop'
  | 'form-field-update';

/** Data payload per action type — enough to reconstruct undo/redo */
export interface HistoryActionData {
  /** Human-readable label */
  label: string;
  /** Object IDs this action affected */
  targetIds: string[];
  /** Type discriminator */
  type: HistoryActionType;
  /** For text-edit: original content before the edit (for undo) */
  previousContent?: string;
  /** For text-edit: new content after the edit (for redo) */
  newContent?: string;
  /** For add/delete operations: full serializable object data for re-creation */
  objectData?: unknown;
  /** For page operations: page index */
  pageIndex?: number;
  /** For page-reorder: original index */
  fromIndex?: number;
  /** For page-reorder: destination index */
  toIndex?: number;
  /** For page-rotate: rotation angle in degrees */
  rotation?: number;
  /** For page-crop: previous crop box */
  previousCropBox?: { x: number; y: number; width: number; height: number };
  /** For form-field-update: previous field value */
  previousValue?: string | boolean;
  /** For form-field-update: new field value */
  newValue?: string | boolean;
}

/** Live history action with executable undo/redo */
interface HistoryAction {
  id: string;
  data: HistoryActionData;
  timestamp: number;
  validate: () => boolean;
  /** Execute the undo for this action */
  executeUndo: () => void;
  /** Execute the redo for this action */
  executeRedo: () => void;
}

interface HistoryState {
  actions: HistoryAction[];
  pointer: number;
  maxSize: number;
  skippedReason: string | null;

  push: (data: Omit<HistoryActionData, never>) => void;
  undo: () => boolean;
  redo: () => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;
  getLastAction: () => (HistoryActionData & { id: string }) | null;
  clearSkippedReason: () => void;
  clear: () => void;
  hydrateHistory: (snapshot: HistorySnapshot) => void;
  /** Returns a serializable snapshot of current history state */
  getSnapshot: () => HistorySnapshot;
}

/** Serializable snapshot — safe to store in IndexedDB */
export interface HistorySnapshot {
  actions: Array<{
    id: string;
    data: HistoryActionData;
    timestamp: number;
  }>;
  pointer: number;
}

/** Reconstruct executeUndo from action data + live store state */
function buildExecuteUndo(data: HistoryActionData): () => void {
  return () => {
    const docStore = useDocumentStore.getState();
    const objStore = useObjectsStore.getState();
    switch (data.type) {
      case 'text-edit':
        if (data.targetIds[0] && data.previousContent !== undefined) {
          objStore.updateTextObject(data.targetIds[0], { content: data.previousContent });
        }
        break;
      case 'text-add':
        data.targetIds.forEach((id) => objStore.removeTextObject(id));
        break;
      case 'text-delete':
        if (data.objectData) {
          objStore.addTextObject(data.objectData as Parameters<typeof objStore.addTextObject>[0]);
        }
        break;
      case 'annotation-add':
        data.targetIds.forEach((id) => objStore.removeAnnotation(id));
        break;
      case 'annotation-delete':
        if (data.objectData) {
          objStore.addAnnotation(data.objectData as Parameters<typeof objStore.addAnnotation>[0]);
        }
        break;
      case 'annotation-update':
        (data.targetIds as string[]).forEach((id) => {
          if (data.objectData) {
            const prev = (data.objectData as Record<string, unknown>)['previous'] as Record<string, unknown>;
            if (prev) objStore.updateAnnotation(id, prev as Parameters<typeof objStore.updateAnnotation>[1]);
          }
        });
        break;
      case 'image-add':
        (data.targetIds as string[]).forEach((id) => objStore.removeImageObject(id));
        break;
      case 'image-delete':
        if (data.objectData) {
          objStore.addImageObject(data.objectData as Parameters<typeof objStore.addImageObject>[0]);
        }
        break;
      case 'image-update':
        (data.targetIds as string[]).forEach((id) => {
          const img = objStore.imageObjects.find((i) => i.id === id);
          if (img && data.objectData) {
            const prev = (data.objectData as Record<string, unknown>)['previous'] as Partial<typeof img>;
            if (prev) objStore.updateImageObject(id, prev);
          }
        });
        break;
      case 'page-delete':
        if (data.objectData) {
          const obj = data.objectData as Record<string, unknown>;
          docStore.addPage(data.pageIndex ?? -1, obj['size'] as { width: number; height: number } | undefined);
        }
        break;
      case 'page-duplicate':
        // Undo duplicate = delete the duplicated page
        if (data.pageIndex !== undefined) {
          docStore.deletePage(data.pageIndex + 1);
        }
        break;
      case 'page-reorder':
        if (data.fromIndex !== undefined && data.toIndex !== undefined) {
          docStore.reorderPages(data.toIndex, data.fromIndex);
        }
        break;
      case 'page-rotate':
        if (data.pageIndex !== undefined && data.rotation !== undefined) {
          docStore.rotatePage(data.pageIndex, data.rotation === 90 ? 'left' : 'right');
        }
        break;
      case 'page-crop':
        if (data.pageIndex !== undefined && data.previousCropBox) {
          docStore.cropPage(data.pageIndex, data.previousCropBox);
        }
        break;
      case 'page-add':
        if (data.pageIndex !== undefined) {
          docStore.deletePage(data.pageIndex);
        }
        break;
      case 'form-field-update':
        if (data.targetIds[0] && data.previousValue !== undefined) {
          docStore.updateFormFieldValue(data.targetIds[0], data.previousValue);
        }
        break;
      default:
        break;
    }
  };
}

/** Reconstruct executeRedo from action data + live store state */
function buildExecuteRedo(data: HistoryActionData): () => void {
  return () => {
    const docStore = useDocumentStore.getState();
    const objStore = useObjectsStore.getState();
    switch (data.type) {
      case 'text-edit':
        if (data.targetIds[0] && data.newContent !== undefined) {
          objStore.updateTextObject(data.targetIds[0], { content: data.newContent });
        }
        break;
      case 'text-add':
        if (data.objectData) {
          objStore.addTextObject(data.objectData as Parameters<typeof objStore.addTextObject>[0]);
        }
        break;
      case 'text-delete':
        data.targetIds.forEach((id) => objStore.removeTextObject(id));
        break;
      case 'annotation-add':
        if (data.objectData) {
          objStore.addAnnotation(data.objectData as Parameters<typeof objStore.addAnnotation>[0]);
        }
        break;
      case 'annotation-delete':
        data.targetIds.forEach((id) => objStore.removeAnnotation(id));
        break;
      case 'annotation-update':
        data.targetIds.forEach((id) => {
          if (data.objectData) {
            const obj = data.objectData as Record<string, unknown>;
            const next = obj['next'] as Record<string, unknown>;
            if (next) objStore.updateAnnotation(id, next as Parameters<typeof objStore.updateAnnotation>[1]);
          }
        });
        break;
      case 'image-add':
        if (data.objectData) {
          objStore.addImageObject(data.objectData as Parameters<typeof objStore.addImageObject>[0]);
        }
        break;
      case 'image-delete':
        data.targetIds.forEach((id) => objStore.removeImageObject(id));
        break;
      case 'image-update':
        data.targetIds.forEach((id) => {
          if (data.objectData) {
            const obj = data.objectData as Record<string, unknown>;
            const next = obj['next'] as Partial<Record<string, unknown>>;
            if (next) objStore.updateImageObject(id, next as Parameters<typeof objStore.updateImageObject>[1]);
          }
        });
        break;
      case 'page-add':
        if (data.pageIndex !== undefined) {
          const doc = docStore.pdfDocument;
          if (doc && data.pageIndex >= 0 && data.pageIndex < doc.getPageCount()) {
            docStore.addPage(data.pageIndex ?? -1);
          }
        }
        break;
      case 'page-delete':
        if (data.pageIndex !== undefined) {
          docStore.deletePage(data.pageIndex);
        }
        break;
      case 'page-duplicate':
        if (data.pageIndex !== undefined) {
          const doc = docStore.pdfDocument;
          if (doc && data.pageIndex >= 0 && data.pageIndex + 1 < doc.getPageCount()) {
            docStore.duplicatePage(data.pageIndex);
          }
        }
        break;
      case 'page-reorder':
        if (data.fromIndex !== undefined && data.toIndex !== undefined) {
          docStore.reorderPages(data.fromIndex, data.toIndex);
        }
        break;
      case 'page-rotate':
        if (data.pageIndex !== undefined && data.rotation !== undefined) {
          docStore.rotatePage(data.pageIndex, data.rotation === 90 ? 'right' : 'left');
        }
        break;
      case 'page-crop':
        if (data.pageIndex !== undefined && data.objectData) {
          const obj = data.objectData as Record<string, unknown>;
          const current = obj['current'] as { x: number; y: number; width: number; height: number };
          if (current) docStore.cropPage(data.pageIndex, current);
        }
        break;
      case 'form-field-update':
        if (data.targetIds[0] && data.newValue !== undefined) {
          docStore.updateFormFieldValue(data.targetIds[0], data.newValue);
        }
        break;
      default:
        break;
    }
  };
}

function validateFromStore(targetIds: string[], type: HistoryActionType): boolean {
  const objStore = useObjectsStore.getState();
  return targetIds.every((id) => {
    const inText = objStore.textObjects.some((t) => t.id === id);
    const inImage = objStore.imageObjects.some((img) => img.id === id);
    const inAnnotation = objStore.annotations.some((a) => a.id === id);
    return inText || inImage || inAnnotation;
  });
}

// Snapshot cache for getSnapshot memoization — avoids infinite loop with useSyncExternalStore
let snapshotCache: { actions: Array<{id: string; data: HistoryActionData; timestamp: number}>; pointer: number } | null = null;
let snapshotCacheVersion = -1;

export const useHistoryStore = create<HistoryState>((set, get) => ({
  actions: [],
  pointer: -1,
  maxSize: 200,
  skippedReason: null,

  push: (data) =>
    set((state) => {
      const actions = state.actions.slice(0, state.pointer + 1);

      const newAction: HistoryAction = {
        id: crypto.randomUUID(),
        data,
        timestamp: Date.now(),
        validate: () => validateFromStore(data.targetIds, data.type),
        executeUndo: buildExecuteUndo(data),
        executeRedo: buildExecuteRedo(data),
      };
      actions.push(newAction);
      return { actions, pointer: actions.length - 1 };
    }),

  undo: () => {
    const { pointer, actions } = get();
    if (pointer < 0) return false;
    const action = actions[pointer];
    if (!action.validate()) {
      const reason = `Cannot undo "${action.data.label}"`;
      console.warn(`[History] ${reason}: target object(s) no longer exist in document`);
      set({ skippedReason: reason });
      return false;
    }
    action.executeUndo();
    set({ pointer: pointer - 1 });
    return true;
  },

  redo: () => {
    const { pointer, actions } = get();
    if (pointer >= actions.length - 1) return false;
    const nextPointer = pointer + 1;
    const action = actions[nextPointer];
    if (!action.validate()) {
      const reason = `Cannot redo "${action.data.label}"`;
      console.warn(`[History] ${reason}: target object(s) no longer exist in document`);
      set({ skippedReason: reason });
      return false;
    }
    action.executeRedo();
    set({ pointer: nextPointer });
    return true;
  },

  canUndo: () => get().pointer >= 0,
  canRedo: () => get().pointer < get().actions.length - 1,

  getLastAction: () => {
    const { pointer, actions } = get();
    return pointer >= 0 ? { id: actions[pointer].id, ...actions[pointer].data } : null;
  },

  clearSkippedReason: () => set({ skippedReason: null }),

  clear: () => set({ actions: [], pointer: -1 }),

  hydrateHistory: (snapshot) =>
    set((_state) => {
      const restoredActions: HistoryAction[] = snapshot.actions.map((a) => ({
        id: a.id,
        data: a.data,
        timestamp: a.timestamp,
        validate: () => validateFromStore(a.data.targetIds, a.data.type),
        executeUndo: buildExecuteUndo(a.data),
        executeRedo: buildExecuteRedo(a.data),
      }));

      const pointer = Math.min(Math.max(snapshot.pointer, -1), restoredActions.length - 1);
      return { actions: restoredActions, pointer };
    }),

  getSnapshot: () => {
    const { actions, pointer } = get();
    const version = actions.length + pointer;
    if (!snapshotCache || snapshotCacheVersion !== version) {
      snapshotCache = {
        actions: actions.map((a) => ({
          id: a.id,
          data: a.data,
          timestamp: a.timestamp,
        })),
        pointer,
      };
      snapshotCacheVersion = version;
    }
    return snapshotCache;
  },
}));