import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

interface SearchMatch {
  textObjectId: string;
  pageIndex: number;
  matchStart: number;
  matchEnd: number;
  matchText: string;
}

interface SearchState {
  searchQuery: string;
  searchActiveMatches: SearchMatch[];
  searchCurrentMatchIndex: number;

  // Actions
  setSearchQuery: (query: string) => void;
  setSearchActiveMatches: (matches: SearchMatch[]) => void;
  setSearchCurrentMatchIndex: (index: number) => void;
  clearSearch: () => void;
}

const initialState = {
  searchQuery: '',
  searchActiveMatches: [] as SearchMatch[],
  searchCurrentMatchIndex: 0,
};

export const useSearchStore = create<SearchState>()(
  immer((set) => ({
    ...initialState,

    setSearchQuery: (query) =>
      set((state) => {
        state.searchQuery = query;
      }),
    setSearchActiveMatches: (matches) =>
      set((state) => {
        state.searchActiveMatches = matches;
      }),
    setSearchCurrentMatchIndex: (index) =>
      set((state) => {
        state.searchCurrentMatchIndex = index;
      }),
    clearSearch: () =>
      set((state) => {
        state.searchQuery = '';
        state.searchActiveMatches = [];
        state.searchCurrentMatchIndex = 0;
      }),
  }))
);