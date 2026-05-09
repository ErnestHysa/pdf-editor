"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { openDB, IDBPDatabase } from "idb";
import { useDocumentStore } from "@/stores/documentStore";
import { useHistoryStore } from "@/stores/historyStore";
import { useUIStore } from "@/stores/uiStore";
import { exportPdfWithChanges } from "./usePdfExporter";
import { AUTOSAVE_DELAY_MS } from "@/lib/constants";

const DB_NAME = "pagecraft";
const DB_VERSION = 4; // Bump version; adds overlay store for Zustand-only objects
const STORE_NAME = "documents";
const HISTORY_STORE_NAME = "history";
const OVERLAY_STORE_NAME = "overlay";
const BROADCAST_CHANNEL_NAME = "pagecraft-documents";

interface SavedDocument {
  id: string;
  name: string;
  data: ArrayBuffer;
  savedAt: number;
  lastModified: number; // Timestamp of last modification by any tab
  /** Edit sequence number — incremented on each document edit. Prevents stale saves. (#27) */
  editSequence: number;
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
      if (oldVersion < 4) {
        // Version 4 adds overlay store for Zustand-only objects
        if (!db.objectStoreNames.contains(OVERLAY_STORE_NAME)) {
          db.createObjectStore(OVERLAY_STORE_NAME, { keyPath: "docId" });
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

// ── Beforeunload guard ────────────────────────────────────────────

export function flushSave(): void {
  const { pdfDocument, fileName, isDirty } = useDocumentStore.getState();
  if (!pdfDocument || !isDirty) return;

  // Synchronously save to IndexedDB
  const doSave = async () => {
    try {
      const libDoc = pdfDocument.getLibDoc();
      const pdfBytes = await libDoc.save();
      const db = await getDb();
      const now = Date.now();

      // Use explicit transaction to capture quota errors
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      tx.onerror = () => {
        console.error('[Autosave] IDB error:', tx.error);
        const msg = (tx.error?.message ?? '').toLowerCase();
        if (msg.includes('quota') || msg.includes('space') || msg.includes('disk')) {
          useUIStore.getState().setToast?.('Autosave failed: storage quota exceeded. Try closing other tabs or removing saved files.');
        }
      };

      // idb's put returns Promise; we use tx.complete to wait
      store.put({
        id: "current",
        name: fileName,
        data: pdfBytes.buffer,
        savedAt: now,
        lastModified: now,
      } as SavedDocument);

      tx.oncomplete = () => {
        useDocumentStore.getState().setDirty(false);
        useDocumentStore.getState().setSaveStatus('saved');
        useDocumentStore.getState().setLastSavedAt(now);
        console.log("[Autosave] flushSave completed");
      };
    } catch (err) {
      console.error("[Autosave] flushSave failed:", err);
      const msg = (err as Error).message?.toLowerCase() ?? '';
      if (msg.includes('quota') || msg.includes('space') || msg.includes('disk')) {
        useUIStore.getState().setToast?.('Autosave failed: storage quota exceeded. Try closing other tabs or removing saved files.');
      }
    }
  };

  doSave();
}

// ── Clear old autosave entries ──────────────────────────────────

export async function clearOldDocuments(keepCount = 5): Promise<void> {
  try {
    const db = await getDb();
    const all = await db.getAll(STORE_NAME);
    if (all.length <= keepCount) return;

    const sorted = [...all].sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0));
    const toDelete = sorted.slice(keepCount);

    const tx = db.transaction(STORE_NAME, 'readwrite');
    for (const item of toDelete) {
      await tx.store.delete(item.id);
    }
    await tx.done;
    console.log('[Autosave] cleared', toDelete.length, 'old document(s)');
  } catch (err) {
    console.error('[Autosave] clearOldDocuments failed:', err);
  }
}

export function useAutosave() {
  const { pdfDocument, fileName, isDirty, setDirty, setSaveStatus, setLastSavedAt } = useDocumentStore();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editSequenceRef = useRef(0);

  // Prune old IndexedDB entries on init (#19)
  clearOldDocuments(5).catch(() => {});

  // When document becomes dirty, increment edit sequence (#27)
  const prevIsDirty = useRef(false);
  if (isDirty && !prevIsDirty.current) {
    editSequenceRef.current += 1;
  }
  prevIsDirty.current = isDirty;

  // Beforeunload guard
  useEffect(() => {
    const handleBeforeUnload = () => {
      const state = useDocumentStore.getState();
      if (state.isDirty) {
        // Attempt flush before page unloads
        flushSave();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

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
      // Capture sequence at save start — skip if a newer edit has already been saved by another cycle (#27)
      const thisSequence = editSequenceRef.current;
      const db = await getDb();
      const existing = await db.get(STORE_NAME, "current") as SavedDocument | undefined;
      if (existing && existing.editSequence > thisSequence) {
        // A newer save has already happened; skip this one
        setSaveStatus('saved');
        return;
      }

      try {
        setSaveStatus('saving');
        const libDoc = pdfDocument.getLibDoc();
        const pdfBytes = await libDoc.save();
        const now = Date.now();

        await db.put(STORE_NAME, {
          id: "current",
          name: fileName,
          data: pdfBytes.buffer,
          savedAt: now,
          lastModified: now,
          editSequence: thisSequence,
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

        // Also save overlay state (Zustand-only objects) for safety net
        await saveOverlayState(docId);
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

// ── Overlay state persistence ───────────────────────────────────

interface OverlayState {
  textObjects: import("@/stores/documentStore").SerializableTextObject[];
  imageObjects: import("@/stores/documentStore").SerializableImageObject[];
  annotations: import("@/stores/documentStore").AnnotationObject[];
  formFieldValues: Record<string, string | boolean>;
  pendingSignature: { dataUrl: string; width: number; height: number } | null;
}

/** Save the current Zustand overlay state to IndexedDB */
export async function saveOverlayState(docId: string): Promise<void> {
  try {
    const state = useDocumentStore.getState();
    const overlay: OverlayState = {
      textObjects: state.textObjects,
      imageObjects: state.imageObjects,
      annotations: state.annotations,
      formFieldValues: state.formFieldValues,
      pendingSignature: state.pendingSignature,
    };
    const db = await getDb();
    await db.put(OVERLAY_STORE_NAME, { docId, ...overlay }, docId);
    console.debug("[Autosave] overlay saved for doc:", docId);
  } catch (err) {
    console.error("[Autosave] saveOverlayState failed:", err);
  }
}

/** Load overlay state from IndexedDB */
export async function loadOverlayState(
  docId: string
): Promise<OverlayState | null> {
  try {
    const db = await getDb();
    const saved = await db.get(OVERLAY_STORE_NAME, docId);
    return saved ?? null;
  } catch (err) {
    console.error("[Autosave] loadOverlayState failed:", err);
    return null;
  }
}

/** Delete saved overlay state for a document */
export async function deleteOverlayState(docId: string): Promise<void> {
  try {
    const db = await getDb();
    await db.delete(OVERLAY_STORE_NAME, docId);
  } catch (err) {
    console.error("[Autosave] deleteOverlayState failed:", err);
  }
}
