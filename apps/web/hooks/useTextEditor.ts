'use client';
import { useCallback, useRef } from 'react';
import { useDocumentStore } from '@/stores/documentStore';
import { useHistoryStore } from '@/stores/historyStore';
import { TextObject } from '@pagecraft/pdf-engine';
import { glyphPreservingEdit } from '@/lib/pdf/glyphEditor';

interface TextEditState {
  objectId: string | null;
  pageIndex: number;
  originalContent: string;
}

export function useTextEditor() {
  const { pdfDocument, selectedObjects } = useDocumentStore();
  const { push } = useHistoryStore();
  const editStateRef = useRef<TextEditState | null>(null);

  const startEditing = useCallback((objectId: string, pageIndex: number, content: string) => {
    editStateRef.current = { objectId, pageIndex, originalContent: content };
  }, []);

  const commitEdit = useCallback((newContent: string): boolean => {
    const state = editStateRef.current;
    if (!state || !pdfDocument) return false;
    editStateRef.current = null;

    const page = pdfDocument.getPage(state.pageIndex);
    if (!page) return false;

    const obj = page.getObjects().texts.find((t: any) => t.getId() === state.objectId);
    if (!obj) return false;

    if (newContent === state.originalContent) return false;

    const originalContent = state.originalContent;
    const objectId = state.objectId;
    const pageIndex = state.pageIndex;

    // Push to history before committing
    push({
      label: `Edited text`,
      targetIds: objectId ? [objectId] : [],
      type: 'text-edit',
      previousContent: originalContent,
      newContent,
      objectData: { content: newContent, objectRef: obj.getObjectRef() },
    });

    obj.setContent(newContent);
    // C4: Try glyph-level edit first to preserve kerning/ligatures.
    // Falls back to overlay approach (no formatting preserved) if the
    // content stream is compressed or the string can't be located.
    const editedGlyph = glyphPreservingEdit(
      state.pageIndex,
      obj.getObjectRef(),
      originalContent,
      newContent,
    );
    if (!editedGlyph) {
      // Formatting may not be preserved — the text will be redrawn
      // via the overlay approach in exportPdfWithChanges()
      console.info("[C4] Glyph-level edit not possible; using overlay fallback");
    }
    useDocumentStore.getState().setDirty(true);
    return true;
  }, [pdfDocument, push]);

  const cancelEdit = useCallback(() => {
    editStateRef.current = null;
  }, []);

  return { startEditing, commitEdit, cancelEdit };
}
