"use client";
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useDocumentStore } from '@/stores/documentStore';
import { useObjectsStore } from '@/stores/objectsStore';
import { useSearchStore } from '@/stores/searchStore';
import type { SerializableTextObject } from '@/stores/documentStore';
import { useSearch } from '@/hooks/useSearch';
import { cn } from '@/lib/utils';

interface SearchResult {
  textObject: SerializableTextObject;
  matchStart: number;
  matchEnd: number;
  matchText: string;
}

interface SearchMatch {
  textObject: SerializableTextObject;
  matches: Array<{ start: number; end: number }>;
}

export function SearchOverlay() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const textObjects = useObjectsStore((s) => s.textObjects);
  const searchActiveMatches = useSearchStore((s) => s.searchActiveMatches);
  const searchCurrentMatchIndex = useSearchStore((s) => s.searchCurrentMatchIndex);
  const setSearchActiveMatches = useSearchStore((s) => s.setSearchActiveMatches);
  const setSearchCurrentMatchIndex = useSearchStore((s) => s.setSearchCurrentMatchIndex);
  const clearSearch = useSearchStore((s) => s.clearSearch);
  const setActivePage = useDocumentStore((s) => s.setActivePage);

  const { executeSearch, clearSearch: clearSearchHandler, nextMatch, prevMatch } = useSearch();

  // Derive search results from store's searchActiveMatches + textObjects for display
  const searchResults = useMemo((): SearchResult[] => {
    return searchActiveMatches
      .map((match: any) => {
        const textObj = textObjects.find((t: any) => t.id === match.textObjectId);
        if (!textObj) return null;
        return {
          textObject: textObj,
          matchStart: match.matchStart,
          matchEnd: match.matchEnd,
          matchText: match.matchText,
        } as SearchResult;
      })
      .filter(Boolean) as SearchResult[];
  }, [searchActiveMatches, textObjects]);

  // Group results by page for display
  const resultsByPage = useMemo(() => {
    const grouped = new Map<number, SearchResult[]>();
    searchResults.forEach((result) => {
      const pageIndex = result.textObject.pageIndex;
      if (!grouped.has(pageIndex)) {
        grouped.set(pageIndex, []);
      }
      grouped.get(pageIndex)!.push(result);
    });
    return grouped;
  }, [searchResults]);

  const totalMatches = searchResults.length;
  const uniquePages = resultsByPage.size;

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard shortcut handler (Ctrl+F / Cmd+F)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Call executeSearch when query changes — debounced 300ms to avoid
  // hammering the main thread on every keystroke for large documents
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!debouncedQuery.trim()) return;
    executeSearch(debouncedQuery);
  }, [debouncedQuery, executeSearch]);

  // Focus input when overlay opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setHighlightedId(null);
      clearSearchHandler();
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open, clearSearchHandler]);

  // Navigate to result
  const navigateToResult = useCallback((result: SearchResult, matchIndex: number) => {
    const { textObject } = result;
    setActivePage(textObject.pageIndex);
    setHighlightedId(textObject.id);
    setSearchCurrentMatchIndex(matchIndex);
    // Add the matched text object's page to activeMatches list with position info
    setSearchActiveMatches([{
      textObjectId: textObject.id,
      pageIndex: textObject.pageIndex,
      matchStart: result.matchStart,
      matchEnd: result.matchEnd,
      matchText: result.matchText,
    }]);

    // Clear any existing timeout
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }

    // Remove highlight after delay
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedId(null);
    }, 2000);

    setOpen(false);
    setQuery('');
  }, [setActivePage, setSearchActiveMatches, setSearchCurrentMatchIndex]);

  // Navigate prev/next
  const navigatePrev = useCallback(() => {
    if (searchResults.length === 0) return;
    const newIndex = selectedIndex === 0 ? searchResults.length - 1 : selectedIndex - 1;
    setSelectedIndex(newIndex);
    setSearchCurrentMatchIndex(newIndex);
    const result = searchResults[newIndex];
    if (result) {
      setSearchActiveMatches([{
        textObjectId: result.textObject.id,
        pageIndex: result.textObject.pageIndex,
        matchStart: result.matchStart,
        matchEnd: result.matchEnd,
        matchText: result.matchText,
      }]);
      setActivePage(result.textObject.pageIndex);
    }
  }, [searchResults.length, selectedIndex, searchResults, setActivePage, setSearchActiveMatches, setSearchCurrentMatchIndex]);

  const navigateNext = useCallback(() => {
    if (searchResults.length === 0) return;
    const newIndex = selectedIndex === searchResults.length - 1 ? 0 : selectedIndex + 1;
    setSelectedIndex(newIndex);
    setSearchCurrentMatchIndex(newIndex);
    const result = searchResults[newIndex];
    if (result) {
      setSearchActiveMatches([{
        textObjectId: result.textObject.id,
        pageIndex: result.textObject.pageIndex,
        matchStart: result.matchStart,
        matchEnd: result.matchEnd,
        matchText: result.matchText,
      }]);
      setActivePage(result.textObject.pageIndex);
    }
  }, [searchResults.length, selectedIndex, searchResults, setActivePage, setSearchActiveMatches, setSearchCurrentMatchIndex]);

  // Keyboard navigation in results
  useEffect(() => {
    if (!open) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % Math.max(1, searchResults.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + searchResults.length) % Math.max(1, searchResults.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (searchResults.length > 0) {
          navigateToResult(searchResults[selectedIndex], selectedIndex);
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, searchResults, selectedIndex, navigateToResult]);

  // Render highlighted text snippet
  const renderHighlightedSnippet = (result: SearchResult) => {
    const { textObject, matchStart, matchEnd } = result;
    const content = textObject.content;
    const contextBefore = content.slice(Math.max(0, matchStart - 30), matchStart);
    const contextAfter = content.slice(matchEnd, Math.min(content.length, matchEnd + 30));
    const isSelected = searchResults.indexOf(result) === selectedIndex;

    return (
      <span className={cn(
        'text-sm break-all',
        isSelected ? 'text-primary' : 'text-secondary'
      )}>
        {contextBefore && <span className="text-tertiary">{contextBefore}</span>}
        <span className={cn(
          'font-medium rounded px-0.5',
          isSelected ? 'bg-accent/40 text-accent' : 'bg-accent/20 text-accent'
        )}>
          {content.slice(matchStart, matchEnd)}
        </span>
        {contextAfter && <span className="text-tertiary">{contextAfter}</span>}
      </span>
    );
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed top-3 right-48 z-50 px-3 py-1.5 rounded-lg bg-elevated border border-border text-xs text-secondary hover:text-primary hover:border-border-strong transition-colors hidden md:flex items-center gap-2"
      >
        <span>⌘F</span>
        <span>Search</span>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]"
      onClick={() => {
        setOpen(false);
        setQuery('');
      }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl mx-4 rounded-xl bg-elevated border border-border shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center px-4 border-b border-border">
          <svg
            className="w-4 h-4 text-secondary flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search text across pages..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (e.shiftKey) prevMatch();
                else nextMatch();
              }
            }}
            className="w-full py-4 bg-transparent text-primary placeholder:text-tertiary outline-none text-sm px-3"
          />
          {query && (
            <div className="flex items-center gap-2 text-xs text-secondary">
              <span>{totalMatches} match{totalMatches !== 1 ? 'es' : ''}</span>
              {uniquePages > 0 && (
                <span className="text-tertiary">on {uniquePages} page{uniquePages !== 1 ? 's' : ''}</span>
              )}
            </div>
          )}
          <kbd className="ml-2 px-1.5 py-0.5 text-xs text-secondary bg-surface border border-border rounded">
            Esc
          </kbd>
        </div>

        {/* Navigation Bar */}
        {query && totalMatches > 0 && (
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface/50">
            <div className="flex items-center gap-1">
              <button
                onClick={navigatePrev}
                className="p-1.5 rounded hover:bg-hover text-secondary hover:text-primary transition-colors"
                title="Previous match"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <button
                onClick={navigateNext}
                className="p-1.5 rounded hover:bg-hover text-secondary hover:text-primary transition-colors"
                title="Next match"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            <span className="text-xs text-secondary">
              {selectedIndex + 1} of {totalMatches}
            </span>
          </div>
        )}

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto py-2">
          {!query && (
            <div className="px-4 py-8 text-center text-sm text-secondary">
              Start typing to search across all pages
            </div>
          )}

          {query && totalMatches === 0 && (
            <div className="px-4 py-8 text-center text-sm text-secondary">
              No matches found for "{query}"
            </div>
          )}

          {query && totalMatches > 0 && (
            <div className="px-2">
              {Array.from(resultsByPage.entries()).map(([pageIndex, pageResults]) => (
                <div key={pageIndex} className="mb-2">
                  <div className="px-3 py-1.5 text-xs font-medium text-secondary uppercase tracking-wider bg-surface/30">
                    Page {pageIndex + 1}
                    <span className="ml-2 text-tertiary font-normal">
                      ({pageResults.length} match{pageResults.length !== 1 ? 'es' : ''})
                    </span>
                  </div>
                  {pageResults.map((result) => {
                    const globalIdx = searchResults.indexOf(result);
                    const isSelected = globalIdx === selectedIndex;
                    return (
                      <button
                        key={`${result.textObject.id}-${globalIdx}`}
                        onClick={() => navigateToResult(result, globalIdx)}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                        className={cn(
                          'w-full text-left px-3 py-2.5 transition-colors rounded-lg',
                          isSelected
                            ? 'bg-accent/20 text-primary'
                            : 'text-secondary hover:bg-hover hover:text-primary'
                        )}
                      >
                        {renderHighlightedSnippet(result)}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer with shortcuts hint */}
        <div className="px-4 py-2 border-t border-border bg-surface/30 flex items-center justify-between text-xs text-tertiary">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-surface border border-border rounded text-[10px]">↑</kbd>
              <kbd className="px-1 py-0.5 bg-surface border border-border rounded text-[10px]">↓</kbd>
              <span className="ml-1">navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-surface border border-border rounded text-[10px]">↵</kbd>
              <span className="ml-1">go to match</span>
            </span>
          </div>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-surface border border-border rounded text-[10px]">⇧</kbd>
            <span>prev</span>
          </span>
        </div>
      </div>
    </div>
  );
}
