"use client";
import { useEffect, useCallback, useState } from "react";
import { openDB, IDBPDatabase } from "idb";
import * as pdfjsLib from "pdfjs-dist/legacy";

const DB_NAME = "pagecraft";
const DB_VERSION = 3; // Bump for recentFiles store
const RECENT_FILES_STORE = "recentFiles";

export interface RecentFile {
  id: string;
  name: string;
  lastModified: number;
  pageCount: number;
  pdfData: ArrayBuffer;
  thumbnail: string; // data URL of first page at 100x140
}

async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains(RECENT_FILES_STORE)) {
          db.createObjectStore(RECENT_FILES_STORE, { keyPath: "id" });
        }
      }
    },
  });
}

/** Generate a thumbnail (100x140) of the first page of a PDF from an ArrayBuffer */
async function generateThumbnail(pdfData: ArrayBuffer): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({ data: pdfData.slice(0) });
  const doc = await loadingTask.promise;
  const page = await doc.getPage(1);
  
  // Target size: 100x140 (portrait-ish), maintain aspect ratio
  const VIEWPORT_WIDTH = 100;
  const VIEWPORT_HEIGHT = 140;
  const pageViewport = page.getViewport({ scale: 1 });
  const scaleX = VIEWPORT_WIDTH / pageViewport.width;
  const scaleY = VIEWPORT_HEIGHT / pageViewport.height;
  const scale = Math.min(scaleX, scaleY);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Cannot get 2d context");

  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.7);
}

/** Save a file to recentFiles. Overwrites if same id exists. */
export async function saveRecentFile(
  id: string,
  name: string,
  pdfData: ArrayBuffer,
  pageCount: number
): Promise<void> {
  try {
    const thumbnail = await generateThumbnail(pdfData);
    const db = await getDb();
    await db.put(RECENT_FILES_STORE, {
      id,
      name,
      lastModified: Date.now(),
      pageCount,
      pdfData,
      thumbnail,
    } as RecentFile);
  } catch (err) {
    console.error("[RecentFiles] save failed:", err);
  }
}

/** Get all recent files sorted by lastModified descending */
export async function getRecentFiles(): Promise<RecentFile[]> {
  try {
    const db = await getDb();
    const all = (await db.getAll(RECENT_FILES_STORE)) as RecentFile[];
    return all.sort((a, b) => b.lastModified - a.lastModified);
  } catch (err) {
    console.error("[RecentFiles] getAll failed:", err);
    return [];
  }
}

/** Delete a specific recent file */
export async function deleteRecentFile(id: string): Promise<void> {
  try {
    const db = await getDb();
    await db.delete(RECENT_FILES_STORE, id);
  } catch (err) {
    console.error("[RecentFiles] delete failed:", err);
  }
}

/** Clear all recent files */
export async function clearAllRecentFiles(): Promise<void> {
  try {
    const db = await getDb();
    await db.clear(RECENT_FILES_STORE);
  } catch (err) {
    console.error("[RecentFiles] clear failed:", err);
  }
}

/** React hook for recent files */
export function useRecentFiles() {
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);

  const refresh = useCallback(async () => {
    const files = await getRecentFiles();
    setRecentFiles(files);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const clearAll = useCallback(async () => {
    await clearAllRecentFiles();
    setRecentFiles([]);
  }, []);

  const removeFile = useCallback(async (id: string) => {
    await deleteRecentFile(id);
    setRecentFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  return { recentFiles, clearAll, removeFile, refresh };
}
