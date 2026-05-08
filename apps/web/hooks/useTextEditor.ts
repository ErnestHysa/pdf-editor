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
      objectData: { content: newContent, objectId },
    });

    // Update Zustand overlay — the overlay approach is the primary editing
    // mechanism. The engine's texts array (page.getObjects().texts) may not
    // be populated from PdfParser, so we use the Zustand textObjects path.
    const store = useDocumentStore.getState();
    if (objectId) {
      const existing = store.textObjects.find(t => t.id === objectId);
      if (existing) {
        store.updateTextObject(objectId, { content: newContent });
      } else {
        // No matching overlay object — fall back to engine direct edit
        const page = pdfDocument.getPage(pageIndex);
        const obj = page?.getObjects().texts.find((t: any) => t.getId() === objectId);
        if (obj) {
          obj.setContent(newContent);
          glyphPreservingEdit(pageIndex, obj.getObjectRef(), originalContent, newContent);
        }
      }
    }
    store.setDirty(true);
    return true;
  }, [pdfDocument, push]);

  const cancelEdit = useCallback(() => {
    editStateRef.current = null;
  }, []);

  return { startEditing, commitEdit, cancelEdit };
}
