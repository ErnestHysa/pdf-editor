'use client';
import { useCallback, useRef } from 'react';
import { useDocumentStore } from '@/stores/documentStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useObjectsStore } from '@/stores/objectsStore';
import { useUIStore } from '@/stores/uiStore';
import { useHistoryStore } from '@/stores/historyStore';
import { glyphPreservingEdit } from '@pagecraft/pdf-engine';

interface TextEditState {
  objectId: string | null;
  pageIndex: number;
  originalContent: string;
}

export function useTextEditor() {
  const { pdfDocument } = useDocumentStore();
  const { selectedObjects } = useSelectionStore();
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

    // Update Zustand overlay — the primary editing mechanism.
    // The engine's texts array may not be populated from PdfParser,
    // so we use the Zustand textObjects path.
    const store = useObjectsStore.getState();
    if (objectId) {
      const existing = store.textObjects.find(t => t.id === objectId);
      if (existing) {
        store.updateTextObject(objectId, { content: newContent });
      } else {
        // No matching overlay object — fall back to engine direct edit
        const page = pdfDocument.getPage(pageIndex);
        const obj = page?.getObjects().texts.find((t: any) => t.getId() === objectId);
        if (obj) {
          const success = glyphPreservingEdit(pageIndex, obj.getObjectRef(), originalContent, newContent, pdfDocument);
          if (!success) {
            useUIStore.getState().setToast('Text edit failed — glyphs could not be preserved');
            return false;
          }
        } else {
          return false; // No object found to update
        }
      }
    }
    useDocumentStore.getState().setDirty(true);
    return true;
  }, [pdfDocument, push]);

  const cancelEdit = useCallback(() => {
    editStateRef.current = null;
  }, []);

  return { startEditing, commitEdit, cancelEdit };
}