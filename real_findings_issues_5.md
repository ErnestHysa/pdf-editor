# real_findings_issues_5.md
## Pagecraft PDF Editor — Real User Test Round 5
**Date:** 2025-05-11
**Tester:** Hermes Agent (browser-based real-user testing)
**Environment:** http://localhost:3000, IRS Form 1040 (2 pages, 249+ fields)
**Commit:** 68e5e3c (R104)

---

## Test Summary

Extensive real-user testing covering UI, UX, and feature flow. Many things work well, but several meaningful bugs and UX issues were found.

---

## FINDINGS

---

### ISSUE-1: Command Palette / Modal System Broken
**Severity:** High
**Category:** UI / UX / Feature Gap

**Problem:** Pressing ⌘K (Command+K) does not open any command palette or modal. The TopBar shows a "⌘K Command" button (`ref=e3`) that appears clickable but no modal ever appears. This blocks keyboard-driven workflows.

**Root Cause:** Likely no CMD+K keyboard handler registered in the app, or the command palette component is not wired up.

**Fix needed:** Register a keyboard listener for ⌘K / Ctrl+K that opens the command palette. If the palette component doesn't exist, it needs to be built.

---

### ISSUE-2: IndexedDB `put()` Error — Inline Key Conflict
**Severity:** High
**Category:** Bug / Data Loss Risk

**Problem:** Console shows repeated errors:
```
[Autosave] saveHistory failed: {stack: "DataError: Failed to execute 'put' on 'IDBObjectStore': The object store uses in-line keys and the key parameter was provided."}
[Autosave] saveOverlayState failed: {stack: "DataError: Failed to execute 'put' on 'IDBObjectStore': The object store uses in-line keys and the key parameter was provided."}
```

**Root Cause:** The `history` and `overlay` object stores use `keyPath: "docId"` (in-line key). But the code calls:
```js
await db.put(HISTORY_STORE_NAME, { docId: key, ...snapshot }, key);  // ← key provided as 2nd arg
await db.put(OVERLAY_STORE_NAME, { docId, ...overlay }, docId);      // ← docId provided as 2nd arg
```
When `keyPath` is set on the store, you must NOT pass a second argument — the key is read from the `docId` property of the object itself. Passing a second argument causes the "in-line keys and the key parameter was provided" error. The data is never actually saved.

**Fix needed:**
- `db.put(HISTORY_STORE_NAME, { docId: key, ...snapshot })` — remove third arg
- `db.put(OVERLAY_STORE_NAME, { docId, ...overlay })` — remove second arg

---

### ISSUE-3: Right Sidebar Toggle Doesn't Open Properties Panel
**Severity:** Medium
**Category:** UI / UX

**Problem:** Clicking "Toggle right sidebar" button (e29) shows no visible change. The right sidebar / properties panel does not appear. The banner shows "Saved" status, meaning autosave is working, but the properties panel is missing from view.

**Expected:** Right sidebar with properties (page size, rotation buttons, etc.) should appear.
**Actual:** No visible panel slides in from the right.

---

### ISSUE-4: Export Dialog Doesn't Open on Export Button Click
**Severity:** High
**Category:** UI / UX / Feature Broken

**Problem:** Clicking the "Export document" button (ref=e27) does not open any export dialog or modal. No visible feedback occurs when clicked.

**Expected:** Export dialog/modal should appear with options.
**Actual:** Nothing happens.

---

### ISSUE-5: Toolbar Shows "Add text" Label After Text Tool Selected
**Severity:** Low
**Category:** UI Polish

**Problem:** After selecting the Text tool (e8), the toolbar area shows "Add text" text — likely a leftover label from a tooltip or status indicator. This should probably be cleared or replaced with contextual instructions when text placement mode is active.

---

### ISSUE-6: Undo/Redo Buttons Don't Update After Actions
**Severity:** Medium
**Category:** Bug

**Problem:** After placing a text element ("Test text content"), the Undo button remained `disabled`. After pressing Escape to exit text placement mode, Undo was still disabled. This suggests either:
1. The text placement didn't actually create a history snapshot
2. The Undo/Redo state isn't being updated in the UI after actions

---

### ISSUE-7: Page Thumbnails Missing Canvas Elements
**Severity:** High
**Category:** Visual Bug

**Problem:** The page thumbnails in the left sidebar show the page number ("1", "2") and the "options" button but NO canvas/preview of the page content. The ThumbnailSlot components are present but the canvas element inside them is not rendering (likely due to the `ThumbnailSlot` component not rendering its children properly, or the canvas drawing code not executing).

**Expected:** Each thumbnail should show a miniature preview of its page.
**Actual:** Canvas elements absent from thumbnail slots.

---

### ISSUE-8: Text Placement Behavior — Canvas Click Creates Text at Origin
**Severity:** Medium
**Category:** UX Surprise

**Problem:** Selecting Text tool (e8) then clicking anywhere on the PDF canvas creates a text object at position (0, 0) of the canvas — NOT at the clicked location. Text appears in the top-left corner regardless of where user clicked.

**Expected:** Text object should appear near the clicked location.
**Actual:** Text always at (0, 0).

---

### ISSUE-9: Draw/Freehand Tool Behavior Unknown
**Severity:** Low
**Category:** Incomplete Testing

**Problem:** Could not verify Draw tool (e18) functionality — need to click and drag on the canvas to test freehand drawing, but the tool's activation and canvas interaction wasn't fully verified in this round.

---

### ISSUE-10: Add Page Button — No Action Observed
**Severity:** Medium
**Category:** UX / Feature

**Problem:** Clicking "Add page" button (e30) in the sidebar produced no visible change. No new blank page appears in the PDF, no page count update, no feedback.

---

### ISSUE-11: Zoom Controls — Only "Fit to Width" Working
**Severity:** Medium
**Category:** Partial Feature Broken

**Problem:** Zoom controls (e41-e45) — only "Fit to width" button (e44) appears functional. "Zoom in" (e43), "Zoom out" (e41), "Reset zoom to 100%" (e42), and "Fit to page" (e45) may not be working correctly.

---

### ISSUE-12: Conflict Resolution Modal — Alert Covers Entire Screen
**Severity:** Medium
**Category:** UI / UX

**Problem:** When another tab modifies the document, the alert/modal ("This document was modified in another tab. What would you like to do?") appears as a full-page alert (ref=e4/e5: "Keep mine" / "Load theirs") blocking all interaction with the app. This is a disruptive pattern — the modal should be a non-blocking toast or a small dialog, not a full剥夺 experience.

---

### ISSUE-13: Sign Document Button — Unknown State
**Severity:** Low
**Category:** Incomplete Testing

**Problem:** "Sign Document" button (e22) was clicked but the behavior was unclear. Either it opened a signature flow that wasn't visible in the snapshot, or nothing happened.

---

### ISSUE-14: Autosave Shows "Saved" Despite Errors
**Severity:** Low
**Category:** UX / Data Integrity

**Problem:** The banner shows "Saved" status after text operations, but the console shows IndexedDB errors for `saveHistory` and `saveOverlayState`. The user sees a green "Saved" indicator that is misleading — their history and overlay state are NOT actually being persisted to IndexedDB.

---

### ISSUE-15: PDF Canvas Renders Form Fields Correctly
**Severity:** Positive
**Category:** Working Feature

**Observation:** The PDF canvas renders the IRS Form 1040 with all 249+ form fields (text boxes, checkboxes, static labels) correctly. Form fields are interactive (can click checkboxes, type in text boxes). The base PDF rendering quality is good.

---

### ISSUE-16: Tool Selection State Indicators Work
**Severity:** Positive
**Category:** Working Feature

**Observation:** Toolbar buttons for tools (Text, Rectangle, Ellipse, Line, Arrow, Highlight, Underline, Strikethrough, Sticky Note, Comment, Draw) show proper selection state. Selected tool is visually indicated in the toolbar.

---

### ISSUE-17: Left Sidebar Toggle Button Present
**Severity:** Positive
**Category:** Working Feature

**Observation:** "Toggle left sidebar" button (e6) is present in the banner. Clicking it likely collapses the left sidebar (pages panel). This toggle functionality appears to work (the sidebar content changes on toggle).

---

## REVISED PRIORITY LIST

### Fix First (High Impact):
1. **ISSUE-2** — IndexedDB `put()` errors (data loss risk, easy fix: remove extra arg from `db.put` calls)
2. **ISSUE-1** — Command palette (⌘K doesn't open)
3. **ISSUE-4** — Export dialog doesn't open

### Fix Second (Medium Impact):
4. **ISSUE-7** — Page thumbnails missing canvas
5. **ISSUE-8** — Text placement at (0,0) not at click location
6. **ISSUE-6** — Undo/Redo buttons don't update state
7. **ISSUE-3** — Right sidebar toggle doesn't open panel

### Fix Third (Polish/UX):
8. **ISSUE-5** — "Add text" label in toolbar
9. **ISSUE-10** — Add page button not working
10. **ISSUE-11** — Zoom controls partially broken
11. **ISSUE-12** — Conflict modal too disruptive

---

## Files Likely Involved
- `apps/web/components/layout/TopBar.tsx` — command palette, export modal
- `apps/web/hooks/useAutosave.ts` — lines ~491 and ~558 — fix `db.put()` calls
- `apps/web/stores/documentStore.ts` — text placement coordinates
- `apps/web/components/canvas/PageThumbnails.tsx` — thumbnail canvas rendering
- `apps/web/components/panels/RightPanel.tsx` — right sidebar toggle
- `apps/web/stores/uiStore.ts` — Undo/Redo state management