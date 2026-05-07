"use client";
import { useEffect, useRef } from "react";
import { openDB, IDBPDatabase } from "idb";
import { useDocumentStore } from "@/stores/documentStore";
import { exportPdfWithChanges } from "./usePdfExporter";
import { AUTOSAVE_DELAY_MS } from "@/lib/constants";

const DB_NAME = "pagecraft";
const DB_VERSION = 1;
const STORE_NAME = "documents";

interface SavedDocument {
  id: string;
  name: string;
  data: ArrayBuffer;
  savedAt: number;
}

async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    },
  });
}

export function useAutosave() {
  const { pdfDocument, fileName, isDirty, setDirty } = useDocumentStore();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!pdfDocument || !isDirty) return;

    // Debounce: wait for user to stop editing before saving
    if (saveTimer.current) clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(async () => {
      try {
        const libDoc = pdfDocument.getLibDoc();
        const pdfBytes = await libDoc.save();
        const db = await getDb();

        await db.put(STORE_NAME, {
          id: "current",
          name: fileName,
          data: pdfBytes.buffer,
          savedAt: Date.now(),
        } as SavedDocument);

        setDirty(false);
        console.log("[Autosave] saved to IndexedDB:", fileName);
      } catch (err) {
        console.error("[Autosave] failed:", err);
      }
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [pdfDocument, isDirty, fileName, setDirty]);
}

/** Load the most recent autosaved document from IndexedDB */
export async function loadAutosavedDocument(): Promise<{
  data: ArrayBuffer;
  name: string;
} | null> {
  try {
    const db = await getDb();
    const saved = await db.get(STORE_NAME, "current") as SavedDocument | undefined;
    if (saved && saved.data) {
      return { data: saved.data, name: saved.name };
    }
    return null;
  } catch (err) {
    console.error("[Autosave] load failed:", err);
    return null;
  }
}

/** Clear the autosaved document from IndexedDB */
export async function clearAutosave(): Promise<void> {
  try {
    const db = await getDb();
    await db.delete(STORE_NAME, "current");
  } catch (err) {
    console.error("[Autosave] clear failed:", err);
  }
}
