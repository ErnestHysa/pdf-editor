"use client";
import { useCallback, useRef } from 'react';
import { PdfEngine } from '@pagecraft/pdf-engine';
import { useDocumentStore } from '@/stores/documentStore';
import { useUIStore } from '@/stores/uiStore';
import { useHistoryStore } from '@/stores/historyStore';
import { saveRecentFile } from '@/hooks/useRecentFiles';
import { loadHistory, loadOverlayState } from '@/hooks/useAutosave';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/** Validate PDF magic bytes: %PDF- version header at start of file */
function isValidPdfBuffer(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 4) return false;
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

/** Compute SHA-256 hash of a buffer for stable document identification */
async function computeHash(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

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

      // Security: validate PDF magic bytes before processing
      if (!isValidPdfBuffer(buffer)) {
        throw new Error('Invalid PDF file. The file content does not match a valid PDF.');
      }

      // Compute stable hash for document identity (prevents filename collisions)
      const docId = await computeHash(buffer);

      const engine = getEngine();
      const doc = await engine.load(buffer);
      if (!doc || doc.getPageCount() === 0) {
        throw new Error('PDF appears to be corrupted or empty.');
      }
      setDocument(doc, file.name, file.size, docId);
      setZoom(1.0);

      // Restore history from IndexedDB if available (using stable docId hash)
      const snapshot = await loadHistory(docId);
      if (snapshot) {
        useHistoryStore.getState().hydrateHistory(snapshot);
        console.debug("[FileHandler] history restored for:", docId);
      }

      // Restore overlay state (Zustand-only objects) from IndexedDB
      const overlay = await loadOverlayState(docId);
      if (overlay) {
        const { setTextObjects, setImageObjects, setAnnotations, updateFormFieldValue, setPendingSignature } = useDocumentStore.getState();
        if (overlay.textObjects.length) setTextObjects(overlay.textObjects);
        if (overlay.imageObjects.length) setImageObjects(overlay.imageObjects);
        if (overlay.annotations.length) setAnnotations(overlay.annotations);
        for (const [field, value] of Object.entries(overlay.formFieldValues)) {
          updateFormFieldValue(field, value);
        }
        if (overlay.pendingSignature) setPendingSignature(overlay.pendingSignature);
        console.debug("[FileHandler] overlay restored for:", docId);
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
