import { create } from 'zustand';
import { useDocumentStore } from './documentStore';

interface HistoryAction {
  id: string;
  label: string;
  description: string;
  timestamp: number;
  targetIds: string[]; // object IDs this action affects (for validation)
  undo: () => void;
  redo: () => void;
  validate: () => boolean; // check if target IDs still exist in documentStore
}

interface HistoryState {
  actions: HistoryAction[];
  pointer: number; // index of last applied action (-1 = nothing applied)
  maxSize: number;
  skippedReason: string | null;

  push: (action: Omit<HistoryAction, 'id' | 'timestamp' | 'validate'>) => void;
  undo: () => boolean;
  redo: () => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;
  getLastAction: () => HistoryAction | null;
  clearSkippedReason: () => void;
  clear: () => void;
  hydrateHistory: (snapshot: HistorySnapshot) => void;
  /** Returns a serializable snapshot of current history state */
  getSnapshot: () => HistorySnapshot;
}

/** Serializable snapshot of history state (functions cannot be stored in IndexedDB) */
export interface HistorySnapshot {
  actions: Array<{
    id: string;
    label: string;
    description: string;
    timestamp: number;
    targetIds: string[];
    // undo/redo are re-created from the current documentStore state on restore
  }>;
  pointer: number;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  actions: [],
  pointer: -1,
  maxSize: 100,
  skippedReason: null,

  push: (action) =>
    set((state) => {
      // Truncate any redo history when a new action is pushed
      const actions = state.actions.slice(0, state.pointer + 1);

      // Build validate function to check if target IDs still exist in documentStore
      const validate = () => {
        const docState = useDocumentStore.getState();
        return action.targetIds.every((id) => {
          const inText = docState.textObjects.some((t) => t.id === id);
          const inImage = docState.imageObjects.some((img) => img.id === id);
          const inAnnotation = docState.annotations.some((a) => a.id === id);
          return inText || inImage || inAnnotation;
        });
      };

      const newAction: HistoryAction = {
        ...action,
        id: Math.random().toString(36).slice(2),
        timestamp: Date.now(),
        validate,
      };
      actions.push(newAction);
      // Keep within maxSize
      if (actions.length > state.maxSize) {
        actions.shift();
      }
      return {
        actions,
        pointer: actions.length - 1,
      };
    }),

  undo: () => {
    const { pointer, actions } = get();
    if (pointer < 0) return false;
    const action = actions[pointer];
    if (!action.validate()) {
      const reason = `Cannot undo "${action.label}"`;
      console.warn(`[History] ${reason}: target object(s) no longer exist in document`);
      set({ skippedReason: reason });
      return false;
    }
    action.undo();
    set({ pointer: pointer - 1 });
    return true;
  },

  redo: () => {
    const { pointer, actions } = get();
    if (pointer >= actions.length - 1) return false;
    const nextPointer = pointer + 1;
    const action = actions[nextPointer];
    if (!action.validate()) {
      const reason = `Cannot redo "${action.label}"`;
      console.warn(`[History] ${reason}: target object(s) no longer exist in document`);
      set({ skippedReason: reason });
      return false;
    }
    action.redo();
    set({ pointer: nextPointer });
    return true;
  },

  canUndo: () => get().pointer >= 0,
  canRedo: () => get().pointer < get().actions.length - 1,

  getLastAction: () => {
    const { pointer, actions } = get();
    return pointer >= 0 ? actions[pointer] : null;
  },

  clearSkippedReason: () => set({ skippedReason: null }),

  clear: () => set({ actions: [], pointer: -1 }),

  hydrateHistory: (snapshot) =>
    set((state) => {
      // Re-build full HistoryAction objects from the serializable snapshot.
      // validate is re-created from current documentStore state.
      const docState = useDocumentStore.getState();
      const restoredActions: HistoryAction[] = snapshot.actions.map((a) => ({
        ...a,
        validate: () =>
          a.targetIds.every((id) => {
            const inText = docState.textObjects.some((t) => t.id === id);
            const inImage = docState.imageObjects.some((img) => img.id === id);
            const inAnnotation = docState.annotations.some((ann) => ann.id === id);
            return inText || inImage || inAnnotation;
          }),
        undo: () => {
          // Undo is re-applied via the engine; the actual undo logic is driven by
          // the engine state. Here we mark that we want to step back in history.
          // The caller (e.g. useHistory) is responsible for calling engine.undo().
          console.debug('[History] hydrate undo for action:', a.label);
        },
        redo: () => {
          console.debug('[History] hydrate redo for action:', a.label);
        },
      }));

      // Restore pointer clamped to valid range
      const pointer = Math.min(Math.max(snapshot.pointer, -1), restoredActions.length - 1);
      return { actions: restoredActions, pointer };
    }),

  getSnapshot: () => {
    const { actions, pointer } = get();
    return {
      actions: actions.map((a) => ({
        id: a.id,
        label: a.label,
        description: a.description,
        timestamp: a.timestamp,
        targetIds: a.targetIds,
      })),
      pointer,
    };
  },
}));
