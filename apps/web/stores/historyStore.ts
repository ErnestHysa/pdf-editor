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

  push: (action: Omit<HistoryAction, 'id' | 'timestamp' | 'validate'>) => void;
  undo: () => boolean;
  redo: () => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;
  getLastAction: () => HistoryAction | null;
  clear: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  actions: [],
  pointer: -1,
  maxSize: 100,

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
      console.warn(`[History] Cannot undo "${action.label}": target object(s) no longer exist in document`);
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
      console.warn(`[History] Cannot redo "${action.label}": target object(s) no longer exist in document`);
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

  clear: () => set({ actions: [], pointer: -1 }),
}));
