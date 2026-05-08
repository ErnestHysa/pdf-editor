"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { openDB, IDBPDatabase } from "idb";
import { useDocumentStore } from "@/stores/documentStore";
import { useHistoryStore } from "@/stores/historyStore";
import { exportPdfWithChanges } from "./usePdfExporter";
import { AUTOSAVE_DELAY_MS } from "@/lib/constants";

const DB_NAME = "pagecraft";
const DB_VERSION = 3; // Bump version; useAutosave + useRecentFiles both touch schema
const STORE_NAME = "documents";
const HISTORY_STORE_NAME = "history";
const BROADCAST_CHANNEL_NAME = "pagecraft-documents";

interface SavedDocument {
  id: string;
  name: string;
  data: ArrayBuffer;
  savedAt: number;
  lastModified: number; // Timestamp of last modification by any tab
}

interface BroadcastMessage {
  type: "saved" | "cleared";
  lastModified: number;
  tabId: string;
}

async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 2) {
        // Version 1 had no lastModified field; add it
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      }
      if (oldVersion < 3) {
        // Version 3 adds history store
        if (!db.objectStoreNames.contains(HISTORY_STORE_NAME)) {
          db.createObjectStore(HISTORY_STORE_NAME, { keyPath: "docId" });
        }
      }
    },
  });
}

// Generate a unique tab ID for BroadcastChannel identification
const tabId = typeof window !== "undefined" ? crypto.randomUUID() : "server";

let broadcastChannel: BroadcastChannel | null = null;

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (!broadcastChannel) {
    try {
      broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    } catch {
      console.warn("[Autosave] BroadcastChannel not supported");
      return null;
    }
  }
  return broadcastChannel;
}

export function useAutosave() {
  const { pdfDocument, fileName, isDirty, setDirty, setSaveStatus, setLastSavedAt } = useDocumentStore();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Broadcast save event to other tabs
  const broadcastSave = useCallback((lastModified: number) => {
    const channel = getBroadcastChannel();
    if (channel) {
      channel.postMessage({ type: "saved", lastModified, tabId } as BroadcastMessage);
    }
  }, []);

  useEffect(() => {
    if (!pdfDocument || !isDirty) return;

    // Debounce: wait for user to stop editing before saving
    if (saveTimer.current) clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(async () => {
      try {
        setSaveStatus('saving');
        const libDoc = pdfDocument.getLibDoc();
        const pdfBytes = await libDoc.save();
        const db = await getDb();
        const now = Date.now();

        await db.put(STORE_NAME, {
          id: "current",
          name: fileName,
          data: pdfBytes.buffer,
          savedAt: now,
          lastModified: now,
        } as SavedDocument);

        setDirty(false);
        setSaveStatus('saved');
        setLastSavedAt(now);
        broadcastSave(now);
        console.log("[Autosave] saved to IndexedDB:", fileName);

        // Also persist history state for this document
        const docId = fileName ?? "unknown";
        const snapshot = useHistoryStore.getState().getSnapshot();
        await saveHistory(docId, snapshot);
      } catch (err) {
        console.error("[Autosave] failed:", err);
        setSaveStatus('offline');
      }
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [pdfDocument, isDirty, fileName, setDirty, setSaveStatus, setLastSavedAt, broadcastSave]);
}

/** Load the most recent autosaved document from IndexedDB */
export async function loadAutosavedDocument(): Promise<{
  data: ArrayBuffer;
  name: string;
  lastModified: number;
} | null> {
  try {
    const db = await getDb();
    const saved = await db.get(STORE_NAME, "current") as SavedDocument | undefined;
    if (saved && saved.data) {
      return { data: saved.data, name: saved.name, lastModified: saved.lastModified };
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
    const channel = getBroadcastChannel();
    if (channel) {
      channel.postMessage({ type: "cleared", lastModified: 0, tabId } as BroadcastMessage);
    }
  } catch (err) {
    console.error("[Autosave] clear failed:", err);
  }
}

// In-memory record of when this tab last loaded the document (to detect external changes)
let lastLoadedAt = 0;

/** Set the last loaded timestamp (call after successfully loading) */
export function setLastLoadedAt(timestamp: number) {
  lastLoadedAt = timestamp;
}

/** Returns true if IndexedDB was modified by another tab since last load */
export async function hasExternalModification(): Promise<boolean> {
  if (lastLoadedAt === 0) return false;
  try {
    const db = await getDb();
    const saved = await db.get(STORE_NAME, "current") as SavedDocument | undefined;
    if (!saved) return false;
    // If IndexedDB's lastModified is newer than when we last loaded, another tab saved
    return saved.lastModified > lastLoadedAt;
  } catch {
    return false;
  }
}

/** Conflict resolution hook for use in UI components */
export function useAutosaveConflict() {
  const [hasConflict, setHasConflict] = useState(false);
  const [conflictData, setConflictData] = useState<{
    data: ArrayBuffer;
    name: string;
    lastModified: number;
  } | null>(null);

  // Listen for broadcasts from other tabs
  useEffect(() => {
    const channel = getBroadcastChannel();
    if (!channel) return;

    const handleMessage = async (event: MessageEvent<BroadcastMessage>) => {
      const msg = event.data;
      if (msg.tabId === tabId) return; // Ignore our own messages

      if (msg.type === "saved" && lastLoadedAt > 0) {
        // Another tab saved; check if this tab has newer local changes
        const isExternal = await hasExternalModification();
        if (isExternal && !hasConflict) {
          // There's a conflict - reload the saved document to show to user
          const saved = await loadAutosavedDocument();
          if (saved) {
            setConflictData({
              data: saved.data,
              name: saved.name,
              lastModified: saved.lastModified,
            });
            setHasConflict(true);
          }
        }
      } else if (msg.type === "cleared") {
        setHasConflict(false);
        setConflictData(null);
      }
    };

    channel.addEventListener("message", handleMessage);
    return () => channel.removeEventListener("message", handleMessage);
  }, [hasConflict]);

  /** Reload: accept the external changes */
  const resolveReload = useCallback(() => {
    setHasConflict(false);
    setConflictData(null);
  }, []);

  /** Keep: discard external changes, keep current state */
  const resolveKeep = useCallback(() => {
    setHasConflict(false);
    setConflictData(null);
  }, []);

  return {
    hasConflict,
    conflictData,
    resolveReload,
    resolveKeep,
  };
}

/** Subscribe to external save notifications and check for conflicts on load */
export async function checkConflictOnLoad(): Promise<{
  hasConflict: boolean;
  savedData: { data: ArrayBuffer; name: string; lastModified: number } | null;
}> {
  const saved = await loadAutosavedDocument();
  if (!saved) return { hasConflict: false, savedData: null };

  // Update lastLoadedAt to now (we've just loaded)
  setLastLoadedAt(Date.now());

  // Check if there was an external modification since we opened
  const external = await hasExternalModification();
  // Note: external=true means IndexedDB was modified AFTER our lastLoadedAt
  // But since we just set lastLoadedAt=now, external should be false on fresh load
  // The conflict check is more relevant when another tab broadcasts while we're editing

  return { hasConflict: external, savedData: saved };
}

// ── History persistence ─────────────────────────────────────────────

/** Key used in IndexedDB for a document's history stack */
function historyKey(docId: string): string {
  return `history-${docId}`;
}

/** Save the full history state for a document to IndexedDB */
export async function saveHistory(
  docId: string,
  snapshot: import("@/stores/historyStore").HistorySnapshot
): Promise<void> {
  try {
    const db = await getDb();
    await db.put(
      HISTORY_STORE_NAME,
      { docId: historyKey(docId), ...snapshot },
      historyKey(docId)
    );
    console.debug("[Autosave] history saved for doc:", docId);
  } catch (err) {
    console.error("[Autosave] saveHistory failed:", err);
  }
}

/** Load saved history snapshot for a document from IndexedDB */
export async function loadHistory(
  docId: string
): Promise<import("@/stores/historyStore").HistorySnapshot | null> {
  try {
    const db = await getDb();
    const saved = await db.get(HISTORY_STORE_NAME, historyKey(docId));
    return saved ?? null;
  } catch (err) {
    console.error("[Autosave] loadHistory failed:", err);
    return null;
  }
}

/** Delete saved history for a document */
export async function deleteHistory(docId: string): Promise<void> {
  try {
    const db = await getDb();
    await db.delete(HISTORY_STORE_NAME, historyKey(docId));
  } catch (err) {
    console.error("[Autosave] deleteHistory failed:", err);
  }
}
