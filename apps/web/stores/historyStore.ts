import { create } from 'zustand';

interface HistoryAction {
  id: string;
  label: string;
  timestamp: number;
  undo: () => void;
  redo: () => void;
}

interface HistoryState {
  actions: HistoryAction[];
  pointer: number; // index of last applied action (-1 = nothing applied)
  maxSize: number;

  push: (action: Omit<HistoryAction, 'id' | 'timestamp'>) => void;
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
      const newAction: HistoryAction = {
        ...action,
        id: Math.random().toString(36).slice(2),
        timestamp: Date.now(),
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
    actions[pointer].undo();
    set({ pointer: pointer - 1 });
    return true;
  },

  redo: () => {
    const { pointer, actions } = get();
    if (pointer >= actions.length - 1) return false;
    const nextPointer = pointer + 1;
    actions[nextPointer].redo();
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
