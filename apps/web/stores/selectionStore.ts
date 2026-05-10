import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { SelectedObject } from './documentStore';

interface SelectionState {
  selectedObjects: SelectedObject[];

  // Selection actions
  selectObject: (obj: SelectedObject | null) => void;
  selectObjects: (objs: SelectedObject[]) => void;
  clearSelection: () => void;
  addToSelection: (obj: SelectedObject) => void;
  removeFromSelection: (id: string) => void;

  // Re-index selection when a page is deleted
  reindexPage: (deletedIndex: number) => void;
}

const initialState = {
  selectedObjects: [] as SelectedObject[],
};

export const useSelectionStore = create<SelectionState>()(
  immer((set) => ({
    ...initialState,

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

    reindexPage: (deletedIndex) =>
      set((state) => {
        state.selectedObjects = state.selectedObjects
          .filter((o) => o.pageIndex !== deletedIndex)
          .map((o) => ({
            ...o,
            pageIndex: o.pageIndex > deletedIndex ? o.pageIndex - 1 : o.pageIndex,
          }));
      }),
  }))
);