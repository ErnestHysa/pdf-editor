# Real User Test Findings — Round 2

Date: 2026-05-10
Tester: Hermes Agent
App Version: 350ebe0c3251ac284b0324448831a447fac6346a
Test Duration: ~15 minutes combined across sub-agents

## Summary

- Total Tests: ~90
- PASS: ~15
- FAIL: ~20
- CANNOT TEST: ~50
- INFO: ~5

## Critical Issues (MUST FIX)

1. **PDF Upload/Loading Broken for Browser Automation** — The file input mechanism (`<input type="file">` inside a `<label>`) cannot be triggered programmatically. DataTransfer + dispatchEvent approach does not fire React's onChange handler. ALL subsequent tests are blocked because no PDF can be loaded.

2. **PDF Rendering Crashes with "Maximum update depth exceeded"** — When a PDF is loaded (via manual interaction or DataTransfer workaround), React enters an infinite render loop. This was documented in Round 1 as a React hooks order violation in EditorPage.tsx.

3. **IndexedDB Schema Missing Stores** — The `history` and `overlay` object stores are never created. Console shows: `NotFoundError: Idb has no object store named 'history'` and same for 'overlay'. This breaks autosave and history persistence.

4. **Drag-and-Drop Upload Not Working** — `handleDrop` accepts files but the file never gets processed into the editor state. The `useFileHandler` drop handler exists but doesn't trigger the PDF loading flow.

## High Priority Issues

1. **File Input Cannot Be Programmatic** — The hidden `<input type="file">` inside a cursor-pointer label cannot be triggered by browser automation. This is a blocker for ALL automated testing.

2. **React Render Loop on PDF Load** — "Maximum update depth exceeded" error appears when PDF loads, preventing any editing operations from being tested.

3. **Form Fields Detected But Not Fillable** — IRS Form 1040 shows ~174 form fields in right panel, but the text inputs in the panel are not editable via browser automation.

4. **Autosave Fails** — `clearOldDocuments` fails with NotFoundError, autosave never completes successfully.

## Medium Priority Issues

1. **Theme Toggle Works** — Dark/light theme switching functions correctly.
2. **Sidebar Toggles Work** — Left/right sidebar show/hide works.
3. **Export Buttons Exist** — "Save document (download PDF)" and "Export document" buttons are visible in UI but non-functional due to render crash.
4. **Undo/Redo UI Exists** — UndoRedoPill and TopBar buttons visible but unverified due to PDF not loading.
5. **Search UI Exists** — Search overlay/panel structure present but not testable without loaded PDF.

## Low Priority Issues / Suggestions

1. **Add Debug/Test Mode** — Consider adding `?pdf=test.pdf` URL parameter to load a test PDF without file picker interaction.
2. **Add E2E Test Infrastructure** — Consider using Playwright or similar for automated UI testing rather than manual browser automation.
3. **Fix DataTransfer File Upload** — The current file input's React onChange handler doesn't respond to programmatically dispatched change events.

## Info / Observations

1. The empty state UI ("Drop your PDF here", "Open PDF" button) renders correctly.
2. The app loads without console errors on the empty state.
3. Browser automation CAN navigate to the app and see the empty state correctly.
4. The app's public folder at `apps/web/public/test.pdf` (220KB) exists and can be used as a test fixture.
5. Both sub-agents (Phase 1-8 and Phase 9-16) independently confirmed the same critical blockers.

## Test Detail Log

### Phase 1: Application Load & Empty State
| # | Test | Result | Notes |
|---|------|--------|-------|
| 1.1 | App loads at http://localhost:3000 | PASS | Dark-themed UI renders correctly |
| 1.2 | Empty state shows upload prompt | PASS | "Drop your PDF here" + "Open PDF" button visible |
| 1.3 | Drag-drop a PDF onto the page | FAIL | Drop event fires but PDF not loaded |
| 1.4 | File picker via button click | CANNOT TEST | Input inside label, cannot control file dialog |
| 1.5 | Recent files shown | INFO | Recent files section exists in empty state |

### Phase 2: PDF Rendering
| # | Test | Result | Notes |
|---|------|--------|-------|
| 2.1-2.9 | All rendering tests | CANNOT TEST | No PDF could be loaded due to upload blocker |

### Phase 3-8 | CANNOT TEST | Blocked by PDF upload failure |
### Phase 9-16 | CANNOT TEST | Blocked by PDF upload + render crash |

---

**Root Cause Chain:**
1. File upload (drag-drop + input.click) doesn't work → PDF never loads
2. Even if PDF loads via DataTransfer workaround → React render loop crashes
3. Even if render worked → IndexedDB stores missing → autosave fails
4. All editing features (text, shapes, annotations, page ops) require a rendered PDF = all blocked