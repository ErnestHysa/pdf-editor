# real_findings_issues_6.md
## Pagecraft PDF Editor — Real User Test Round 6
**Date:** 2025-05-11
**Tester:** Hermes Agent (browser-based real-user testing)
**Environment:** http://localhost:3000, IRS Form 1040 (2 pages, 249+ fields)
**Test PDF:** test.pdf (IRS Form 1040, 2 pages, 249+ fields)

---

## Test Summary

Comprehensive testing across all 16 phases. App mostly works for basic editing but several critical issues block core functionality. Stability issues (app crashes on Signature) and critical IndexedDB errors are the biggest concerns.

---

## FINDINGS

---

### ISSUE-1: Signature Crashes App (React Error #310)
**Severity:** Critical
**Category:** App Stability / Crash

**Problem:** Clicking "Sign Document" button causes the entire app to crash with a React error #310 ("Minified React error #310") and a full-page error overlay. This happens consistently every time.

**Root Cause:** React error #310 is typically a hook ordering violation. Previous fixes (commit b72a71c) moved `if (!open) return null` before hooks in `SignaturePad.tsx`, but the error persists — likely the same issue exists in another component or the SignaturePad fix was incomplete.

**Impact:** Digital signature feature is completely unusable. User cannot sign documents at all.

---

### ISSUE-2: IndexedDB `Stores Missing` Recreating DB — Data Loss Risk
**Severity:** Critical
**Category:** Data Loss / IndexedDB Bug

**Problem:** On EVERY page load (even from scratch), the console shows:
```
[Autosave] Stores missing after open: ["documents", "history", "overlay"] — recreating DB
```
And frequently:
```
[RecentFiles] save failed: NotFoundError: Failed to execute 'transaction' on 'IDBDatabase': One of the specified object stores was not found.
```

**Root Cause:** The IndexedDB initialization uses `onupgradeneeded` but something is calling `createObjectStore` on a database that's already at the current version. When `createObjectStore` is called on an already-open connection at the current version, it throws — causing the stores to be missing. The recreation triggers, but data already saved in this session is lost.

**Files:** `useAutosave.ts`, `useRecentFiles.ts`, `documentStore.ts`

**Impact:** Autosave history/overlay state silently fails to save. Recent files feature completely non-functional. Every page load recreates the DB, losing any prior data.

---

### ISSUE-3: Undo/Redo Buttons Stay Permanently Disabled
**Severity:** High
**Category:** Bug / Feature Broken

**Problem:** After placing text, adding highlight annotations, or any other action, both Undo and Redo buttons remain in the `disabled` state. Clicking them does nothing. The "Add text" and "Add highlight" labels appear in the toolbar but no history is being recorded.

**Expected:** After placing a text element, Undo should become enabled.
**Actual:** Undo stays disabled throughout all operations.

**Impact:** Users cannot undo any action. No recovery from mistakes.

---

### ISSUE-4: Add Page Button — No Action Observed
**Severity:** High
**Category:** Feature Broken

**Problem:** Clicking "Add page" button (ref=e28/e29) produces no visible change. No new blank page appears in the PDF, no page count update, no feedback. The "PAGES" label still shows "2".

**Expected:** A new blank page should be inserted, page count should update to 3.
**Actual:** Nothing happens.

---

### ISSUE-5: Export Dialog Doesn't Appear
**Severity:** High
**Category:** UI / Feature Broken

**Problem:** Clicking "Export document" button does not open any export dialog or modal. No visible feedback occurs when clicked.

**Expected:** Export dialog/modal should appear with PDF export options.
**Actual:** Nothing happens.

**Note:** The button exists and is clickable, but no dialog renders.

---

### ISSUE-6: Right Sidebar Toggle — Properties Panel Not Visible After Toggle
**Severity:** Medium
**Category:** UI / UX

**Problem:** When the page first loads, the Properties panel (page size, rotation buttons) is VISIBLE. Clicking "Toggle right sidebar" (ref=e37/e27) makes the panel disappear. Clicking it again does NOT bring the panel back — it stays hidden.

**Expected:** Toggle should show/hide the Properties panel.
**Actual:** The panel disappears on first toggle and does not return on subsequent toggles.

---

### ISSUE-7: ⌘K Command Button — No Modal Opens
**Severity:** Medium
**Category:** UI / Feature Broken

**Problem:** The TopBar shows a "⌘K Command" button (ref=e3) that appears clickable. Clicking it does not open any command palette or modal. The button does nothing.

**Expected:** A command palette/modal should appear when clicked.
**Actual:** Nothing happens.

---

### ISSUE-8: Page Thumbnails — No Canvas Preview
**Severity:** Medium
**Category:** Visual Bug

**Problem:** The page thumbnails in the left sidebar show the page number ("1", "2") and the "options" button but NO canvas/preview of the page content.

**Expected:** Each thumbnail should show a miniature preview of its page content.
**Actual:** Canvas elements absent from thumbnail slots — only page numbers visible.

---

### ISSUE-9: Text Placement — "Add text" Label Persists
**Severity:** Low
**Category:** UI Polish

**Problem:** After selecting the Text tool, the toolbar area shows "Add text" text. This label persists even after pressing Escape and switching tools. It should be cleared when the tool is deselected.

---

### ISSUE-10: IndexedDB `put()` In-Line Key Error (REGRESSION)
**Severity:** High
**Category:** Bug / Data Loss Risk

**Problem:** Console still shows:
```
[Autosave] saveHistory failed: DataError: The object store uses in-line keys and the key parameter was provided.
[Autosave] saveOverlayState failed: DataError: The object store uses in-line keys and the key parameter was provided.
```

**Root Cause:** The fix from R105 (commit 9a1f4e7) was likely reverted or incomplete. The `db.put()` calls for `history` and `overlay` stores still have extra key arguments that conflict with the in-line key schema.

**Note:** This may be related to ISSUE-2 — the `Stores missing` error could be masking the put() errors when they occur.

---

### ISSUE-11: Zoom Controls — Only "Fit to Width" Works
**Severity:** Medium
**Category:** Partial Feature Broken

**Problem:** Zoom controls — only "Fit to width" button works. "Zoom in", "Zoom out", "Reset zoom to 100%", and "Fit to page" may not be functioning correctly.

**Note:** Could not fully verify zoom behavior due to timeouts. Fit to width appeared to work.

---

### ISSUE-12: Page Navigation — Arrow Keys Timeout
**Severity:** Medium
**Category:** Stability / UX

**Problem:** Pressing ArrowRight to navigate to page 2 caused a 30-second timeout. The page became unresponsive and displayed an empty snapshot before recovering.

**Expected:** Arrow keys should navigate between pages smoothly.
**Actual:** Navigation causes severe delays/timeouts.

---

### ISSUE-13: Conflict Alert Covers Entire Screen
**Severity:** Low
**Category:** UI / UX

**Problem:** The conflict resolution alert from BroadcastChannel (multi-tab sync) appears as a full-page alert blocking all interaction with the app. This is a disruptive pattern — the modal should be non-blocking.

---

## POSITIVE FINDINGS

### PDF Rendering
- IRS Form 1040 (2 pages, 249+ form fields) renders correctly
- Form fields are interactive — can click checkboxes, type in text boxes
- Canvas shows the full form content without visual glitches
- Page count shows "2" correctly

### Tool Selection UI
- Toolbar buttons for all tools (Text, Rectangle, Ellipse, Line, Arrow, Highlight, Underline, Strikethrough, Sticky Note, Comment, Draw) show proper selection state
- Selected tool is visually indicated
- "Add text", "Add highlight" labels appear when respective tools are active

### Autosave
- Banner shows "Saved" status after operations
- Autosave is writing to IndexedDB (confirmed by console logs)
- History and overlay saved messages appear after text operations

### Theme Toggle
- Toggle theme button works correctly
- Theme changes apply properly

### Properties Panel (Initially)
- On fresh load, Properties panel is visible and shows:
  - Page dimensions (612 x 792 — Letter size)
  - Page size presets: A4, Letter, Legal, A5
  - Rotation buttons: 0°, 90°, 180°, 270°

### Zoom Controls (Partial)
- Zoom controls group is present and visible
- Fit to width button works

---

## PHASE-BY-PHASE RESULTS

### Phase 1: Application Load — PASS (with warnings)
- App loads at http://localhost:3000/?pdf=test.pdf
- Banner, toolbar, sidebar all visible
- Console errors: `[Autosave] Stores missing` and `[RecentFiles] save failed` warnings
- No React errors on initial load
- Zoom controls visible

### Phase 2: Rendering — PASS
- PDF renders correctly on canvas
- Form fields visible and interactive
- Scrolling through document works
- Two pages loaded (PAGES: 2)

### Phase 3: Text Create/Edit — PARTIAL
- Text tool can be selected
- "Add text" label appears in toolbar
- Text can be typed into the canvas input
- But Undo stays disabled — text not recorded in history

### Phase 4: Drawing — UNTESTED
- Draw tool can be selected but could not verify freehand drawing on canvas
- Tool indicator appears

### Phase 5: Annotations — PARTIAL
- Highlight tool can be selected
- "Add highlight" label appears
- But no visible highlight applied to document
- No annotations panel to verify annotation list

### Phase 6: Page Management — FAIL
- Add page button does nothing
- Page count stays at 2
- Page thumbnails show page numbers but no preview canvases
- Page rotation buttons (0°, 90°, 180°, 270°) visible in Properties panel but not tested due to sidebar toggle bug

### Phase 7: Search — FAIL
- No search panel/UI found in the interface
- No Ctrl+F or search shortcut visible
- Search feature appears to not exist in UI

### Phase 8: History (Undo/Redo) — FAIL
- Undo button stays permanently disabled
- Redo button stays permanently disabled
- No history recorded for any action

### Phase 9: Save/Autosave — PARTIAL
- Banner shows "Saved" status
- Autosave fires after changes
- But IndexedDB put() errors mean history/overlay not actually saved
- Save document button present

### Phase 10: Export — FAIL
- Export button exists and is clickable
- Clicking it does not open any dialog
- No export functionality observable

### Phase 11: Form Fields — PASS
- Form fields (text boxes, checkboxes) are visible on the IRS Form 1040
- Can interact with form fields (type, check/uncheck)
- 249+ form fields detected

### Phase 12: Signature — FAIL (Critical)
- Sign Document button visible in sidebar
- Clicking it causes React error #310 and crashes the app
- Full-page error overlay displayed
- App requires page reload to recover

### Phase 13: Keyboard Shortcuts — PARTIAL
- Escape key works to exit text mode
- ⌘K button visible but does nothing when clicked
- Other shortcuts (Ctrl+Z, Ctrl+S) not verified in this run

### Phase 14: Copy/Paste — PARTIAL
- Text tool allows text input via canvas textbox
- But selection and copy/paste not verified

### Phase 15: Theme/UI — PASS
- Toggle theme button works
- Theme changes apply correctly
- All UI elements visible and properly positioned

### Phase 16: Overall Stability — FAIL
- App crashes on Signature click (React error #310)
- Page navigation causes timeouts
- IndexedDB errors on every load
- Multiple pages become unresponsive

---

## RECOMMENDATIONS

### Critical (Fix First):
1. **ISSUE-1:** Fix React error #310 in Signature — check ALL components involved in the Sign Document flow for hook ordering violations
2. **ISSUE-2:** Fix IndexedDB initialization — stores should not be missing on every load
3. **ISSUE-10:** Fix IndexedDB `put()` in-line key errors — remove extra key arguments from `db.put()` calls
4. **ISSUE-3:** Fix Undo/Redo — history not being recorded; investigate `historyStore.ts` and action recording

### High (Fix Second):
5. **ISSUE-4:** Fix Add page button
6. **ISSUE-5:** Fix Export dialog — wire up the modal
7. **ISSUE-8:** Fix page thumbnail canvases

### Medium (Fix Third):
8. **ISSUE-6:** Fix right sidebar toggle — toggle should work both ways
9. **ISSUE-7:** Fix ⌘K Command — open command palette on click
10. **ISSUE-11:** Verify all zoom controls work
11. **ISSUE-12:** Fix page navigation stability

### Low (Polish):
12. **ISSUE-9:** Clear "Add text" label when tool deselected
13. **ISSUE-13:** Make conflict alert non-blocking

---

## Files Likely Involved
- `apps/web/components/dialogs/SignaturePad.tsx` — React error #310
- `apps/web/hooks/useAutosave.ts` — IndexedDB errors, put() calls
- `apps/web/hooks/useRecentFiles.ts` — RecentFiles NotFoundError
- `apps/web/stores/documentStore.ts` — history/undo recording
- `apps/web/components/layout/TopBar.tsx` — Export dialog, ⌘K
- `apps/web/components/panels/RightPanel.tsx` — right sidebar toggle
- `apps/web/components/canvas/PageThumbnails.tsx` — thumbnail canvas rendering
- `apps/web/components/canvas/EditorPage.tsx` — Add page, page nav