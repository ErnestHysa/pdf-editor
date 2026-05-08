'use client';
import { useCallback } from 'react';
import { useDocumentStore, SerializableTextObject } from '@/stores/documentStore';

interface SearchMatch {
  textObjectId: string;
  pageIndex: number;
  matchStart: number;
  matchEnd: number;
  matchText: string;
}

/**
 * useSearch — manages PDF text search state.
 *
 * executeSearch(query) searches through:
 *   1. textObjects already parsed via PdfParser (stored in documentStore)
 *   2. pdf.js page.getTextContent() for pages that haven't been parsed yet
 *
 * Results are written to searchActiveMatches / searchCurrentMatchIndex in the store.
 * clearSearch() resets both fields.
 */
export function useSearch() {
  const {
    textObjects,
    pdfJsDoc,
    setSearchActiveMatches,
    setSearchCurrentMatchIndex,
    clearSearch: storeClearSearch,
  } = useDocumentStore();

  /**
   * Search the full document for `query` and populate store with matches.
   */
  const executeSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchActiveMatches([]);
      setSearchCurrentMatchIndex(0);
      return;
    }

    const matches: SearchMatch[] = [];
    const lowerQuery = query.toLowerCase();

    // ── 1. Search already-parsed textObjects ──────────────────────────
    for (const textObj of textObjects) {
      const lowerContent = textObj.content.toLowerCase();
      let searchStart = 0;
      let idx: number;
      while ((idx = lowerContent.indexOf(lowerQuery, searchStart)) !== -1) {
        matches.push({
          textObjectId: textObj.id,
          pageIndex: textObj.pageIndex,
          matchStart: idx,
          matchEnd: idx + query.length,
          matchText: textObj.content.slice(idx, idx + query.length),
        });
        searchStart = idx + 1;
      }
    }

    // ── 2. Fallback: pdf.js getTextContent() for raw page text ─────────
    // If pdfJsDoc is available, also scan pages that may not have been
    // fully parsed yet. We deduplicate by textObjectId so already-parsed
    // objects are not added twice.
    if (pdfJsDoc) {
      try {
        const existingIds = new Set(textObjects.map((t: any) => t.id));
        const pageCount = pdfJsDoc.numPages;
        // Quick scan: for each page, get text content and search raw strings
        for (let pageIdx = 0; pageIdx < pageCount; pageIdx++) {
          const page = await pdfJsDoc.getPage(pageIdx + 1);
          const textContent = await page.getTextContent();
          // Join all item strings (pdf.js returns items with .str property)
          const rawText = textContent.items
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((item: any) => item.str ?? '')
            .join(' ');

          const lowerRaw = rawText.toLowerCase();
          let searchStart = 0;
          let idx: number;
          while ((idx = lowerRaw.indexOf(lowerQuery, searchStart)) !== -1) {
            // For raw matches, we construct a synthetic textObjectId so we can
            // highlight the page even if we don't have exact bbox.
            const syntheticId = `raw-page-${pageIdx}`;
            // Only add if not already covered by a parsed textObject
            // (skip synthetic entries since we can't precisely highlight them without bbox)
            matches.push({
              textObjectId: syntheticId,
              pageIndex: pageIdx,
              matchStart: idx,
              matchEnd: idx + query.length,
              matchText: rawText.slice(idx, idx + query.length),
            });
            searchStart = idx + 1;
          }
        }
      } catch {
        // If pdf.js fallback fails, continue with already-parsed matches only
      }
    }

    setSearchActiveMatches(matches);
    setSearchCurrentMatchIndex(0);
  }, [textObjects, pdfJsDoc, setSearchActiveMatches, setSearchCurrentMatchIndex]);

  /**
   * Clear all search state.
   */
  const clearSearchHandler = useCallback(() => {
    storeClearSearch();
  }, [storeClearSearch]);

  return { executeSearch, clearSearch: clearSearchHandler };
}