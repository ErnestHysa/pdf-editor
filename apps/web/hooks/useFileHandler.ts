"use client";
import { useCallback, useRef } from 'react';
import { PdfEngine } from '@pagecraft/pdf-engine';
import { useDocumentStore } from '@/stores/documentStore';
import { useUIStore } from '@/stores/uiStore';
import { useHistoryStore } from '@/stores/historyStore';
import { saveRecentFile } from '@/hooks/useRecentFiles';
import { loadHistory } from '@/hooks/useAutosave';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function useFileHandler() {
  const engineRef = useRef<PdfEngine | null>(null);
  const { setDocument, setLoading } = useDocumentStore();
  const { setZoom } = useUIStore();

  const getEngine = useCallback(() => {
    if (!engineRef.current) engineRef.current = new PdfEngine();
    return engineRef.current;
  }, []);

  const handleFile = useCallback(async (file: File): Promise<void> => {
    if (!file.type.includes('pdf') && !file.name.endsWith('.pdf')) {
      throw new Error('Please select a PDF file.');
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File too large. Maximum size is 50MB.`);
    }

    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const engine = getEngine();
      const doc = await engine.load(buffer);
      setDocument(doc, file.name, file.size);
      setZoom(1.0);

      // Restore history from IndexedDB if available
      const docId = file.name ?? "unknown";
      const snapshot = await loadHistory(docId);
      if (snapshot) {
        useHistoryStore.getState().hydrateHistory(snapshot);
        console.debug("[FileHandler] history restored for:", docId);
      }

      // Save to recent files (non-blocking)
      saveRecentFile(
        file.name,
        buffer,
        doc.getPageCount(),
        file.size
      ).catch(() => {});
    } finally {
      setLoading(false);
    }
  }, [getEngine, setDocument, setLoading, setZoom]);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const getEngineForSave = useCallback((): PdfEngine | null => {
    return engineRef.current;
  }, []);

  return {
    handleFile,
    handleDrop,
    handleDragOver,
    getEngine,
    getEngineForSave,
    MAX_FILE_SIZE,
  };
}
