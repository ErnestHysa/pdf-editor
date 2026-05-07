# PAGECRAFT — SPEC.md

## 1. Concept & Vision

Pagecraft is a browser-native PDF editor that feels like a precision instrument — not a web app pretending to be one. It combines the editing fidelity of Adobe Acrobat with the spatial intelligence of Figma and the restraint of Linear. Every interaction is deliberate, fast, and tactile. The aesthetic draws from premium print design and editorial tools — warm, considered, and crafted. It works beautifully on desktop and mobile, with mobile users getting a first-class, gesture-native experience.

---

## 2. Design Language

### Color Palette

**Dark Mode (default)**
- `--bg-base`: #0C0C0E — deep near-black, the canvas backdrop
- `--bg-surface`: #161618 — panels, sidebars
- `--bg-elevated`: #1E1E22 — cards, dropdowns, modals
- `--bg-hover`: #26262B — hover states
- `--border`: #2A2A30 — subtle borders
- `--border-strong`: #3A3A42 — active borders
- `--text-primary`: #F0EDE8 — warm white (not pure #FFF)
- `--text-secondary`: #8A8A94 — secondary labels
- `--text-tertiary`: #5A5A64 — disabled, hints
- `--accent`: #C97B3E — warm terracotta/amber (primary accent)
- `--accent-hover`: #D4894E — accent hover
- `--accent-muted`: #C97B3E1A — accent at 10% for backgrounds
- `--destructive`: #E05252
- `--success`: #4CAF7D

**Light Mode**
- `--bg-base`: #F8F6F2 — warm off-white, like quality paper
- `--bg-surface`: #FFFFFF
- `--bg-elevated`: #F0EDE8
- `--bg-hover`: #E8E4DC
- `--border`: #D8D4CC
- `--border-strong`: #B8B4AC
- `--text-primary`: #1A1A1E
- `--text-secondary`: #6A6A72
- `--text-tertiary`: #9A9AA2
- `--accent`: #B06A30 — slightly deeper for light mode contrast
- `--accent-hover`: #C97B3E

### Typography
- **UI / Body**: `"DM Sans"` (Google Fonts) — geometric but warm, excellent legibility at small sizes
- **Headings / Brand**: `"Instrument Serif"` (Google Fonts) — elegant serif for app name and major headings
- **Monospace / Metadata**: `"JetBrains Mono"` (Google Fonts) — page numbers, file sizes, coordinates
- Base size: 14px UI, 13px compact/mobile
- Scale: 11 / 12 / 13 / 14 / 16 / 20 / 24 / 32 / 48px

### Spatial System
- Base unit: 4px
- Common spacing: 4, 8, 12, 16, 20, 24, 32, 48, 64px
- Border radius: 4px (buttons, inputs), 6px (cards, panels), 8px (modals), 12px (large surfaces)
- Panel widths: 240px (sidebar), 280px (properties panel), 48px (icon toolbar)

### Motion Philosophy
- All transitions: 150ms ease-out (micro), 250ms ease-out (layout), 350ms ease-out (page transitions)
- Spring physics for drag-and-drop: `cubic-bezier(0.34, 1.56, 0.64, 1)` — slight overshoot
- No bounce for destructive actions
- Staggered panel animations on load (50ms between items)
- Canvas zoom: smooth interpolation, never jumps
- Toolbar collapse: 200ms width transition

### Icon Library
- **Lucide React** — consistent 1.5px stroke weight, 20px default size
- Custom inline SVGs for: page thumbnails, annotation tools, signature pad
- All icons: 20px standard, 16px compact, 24px toolbar on mobile

---

## 3. Layout & Structure

### Desktop (≥1024px)
Three-column layout inspired by Figma's spatial intelligence:

```
┌─────────────────────────────────────────────────────────────┐
│ TOOLBAR (48px height) — top: logo, file ops, mode tabs     │
├──────────┬──────────────────────────────────┬───────────────┤
│ SIDEBAR  │  CANVAS                          │ PROPERTIES    │
│ 240px    │  flex-1, virtualized scroll       │ 280px         │
│          │                                  │               │
│ Pages    │  [page] [page] [page]            │ Tool options   │
│ thumb-   │                                  │ Selection     │
│ nails    │  zoom controls (bottom right)    │ props         │
│          │                                  │               │
└──────────┴──────────────────────────────────┴───────────────┘
```

- Left sidebar: collapsible to 48px (icon-only)
- Right panel: collapsible, contextual (shows when selection exists)
- Canvas: infinite scroll, pages arranged in a vertical stack (single-column like document pages)
- Floating zoom control + minimap (bottom right)
- Undo/redo floating pill (top center, fades when inactive)

### Tablet (768px – 1023px)
- Sidebar becomes a slide-over drawer (hamburger trigger)
- Right panel becomes a bottom sheet
- Toolbar condenses to icon-only
- Canvas takes full width

### Mobile (< 768px)
**This is the hardest design surface and gets the most attention.**
- **No traditional toolbars** — bottom floating action bar (FAB cluster)
- **Bottom sheet** for: pages panel, properties, tool options
- **Swipe gestures** for page navigation
- **Pinch-to-zoom** on canvas
- **Long-press** for context menu on any element
- **Pull-down** from bottom to expand panels
- **Top bar**: minimal — logo (left), undo/redo (center), share/export (right)
- **Page thumbnails**: horizontal scroll strip at bottom (collapsed by default, 80px tall)
- **Tool switcher**: center FAB expands to radial tool menu

### Visual Pacing
- Toolbar and panels: `--bg-surface` — recessed, calm
- Canvas area: `--bg-base` — dark, focused, the document pops
- Active page: subtle `--accent-muted` border glow
- Selected object: solid `--accent` border + resize handles

---

## 4. Features & Interactions

### 4.1 File Operations
- **Open**: drag-and-drop anywhere, click-to-browse, or Ctrl/Cmd+O
- **Create blank**: new blank PDF with configurable page size (A4, Letter, custom)
- **Auto-save**: every change persisted to IndexedDB immediately, no save button needed
- **Export**: PDF (with/without annotations), flattened PDF, optimized PDF
- **Share**: Web Share API on mobile, download on desktop

### 4.2 Navigation & View
- Page thumbnail sidebar (drag to reorder pages)
- Click page thumbnail → jump to page (canvas scrolls)
- Zoom: 25% – 400%, fit-width, fit-page, actual size
- Smooth animated zoom with mousewheel (desktop) or pinch (mobile)
- Scroll-linked page indicator (e.g., "Page 3 of 12" in canvas footer)
- Keyboard nav: arrow keys for page-to-page, +/- for zoom

### 4.3 Real PDF Text Editing (Core Feature)
**Object stream editing** via pdf-lib + custom object model:
- Click any text block → enters inline edit mode
- Edit mode: text becomes a real `<textarea>` overlaid on the exact position
- On blur/Enter: changes written back to the PDF object stream (not a canvas overlay)
- Font, size, color, weight, alignment all preserved from original PDF
- If font is missing → embed a compatible substitute (Noto Sans fallback)
- Multi-column text: detect text runs and update column-aware
- Rotated text: detect rotation matrix, apply edits in same coordinate space
- Escape key cancels edit, restores original text
- Inline toolbar appears above edit field: font size (slider), bold, italic, color

**Text detection pipeline**:
1. PDF.js renders page → captures text items with (x, y, width, height, rotation, font)
2. Custom `TextObject` model maps each text item to a PDF object stream reference
3. On edit: mutate the content stream, recalculate bounding boxes, update appearance stream
4. On save: serialize modified object streams back into the PDF

### 4.4 Page Management
- Add blank page (from toolbar or keyboard shortcut)
- Delete page (from sidebar context menu or keyboard)
- Duplicate page (right-click menu or Ctrl+D)
- Reorder pages (drag-and-drop in sidebar)
- Rotate page (90°, 180°, 270° — from toolbar or context menu)
- Crop page (drag corner handles on canvas)
- Resize page (from properties panel: W×H input fields)
- Insert from file: import another PDF's pages

### 4.5 Image Editing
- Click image → select (blue border + handles)
- Move: drag to reposition
- Resize: corner handles (Shift to constrain aspect ratio)
- Rotate: rotation handle (circular arc above selection)
- Replace: right-click → "Replace image" → file picker
- Delete: Delete/Backspace key or right-click menu
- Properties panel: opacity slider, compression quality, layer order
- Add new image: toolbar button or drag-and-drop onto canvas

### 4.6 Annotations
- **Highlight**: click-drag over text → semi-transparent rect
- **Underline**: same as highlight but underline style
- **Strikethrough**: same gesture, strikethrough style
- **Sticky note**: click to place → expands inline text editor
- **Comment**: click to place → anchored to position
- **Freehand draw**: brush tool with pressure sensitivity (mouse or touch)
- **Shapes**: rectangle, ellipse, arrow, line — drawn on canvas
- **Text box**: click to place, editable, movable
- **Stamp**: predefined stamps (APPROVED, DRAFT, CONFIDENTIAL, custom)
- Each annotation: color picker (6 preset + custom), opacity, delete
- Annotations stored as PDF annotation objects (not canvas drawings)

### 4.7 Undo / Redo
- Full action history (stored as operations, not snapshots)
- Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z
- Floating undo pill shows last action description ("Deleted page 3", "Edited paragraph")
- History survives page refresh (stored in IndexedDB)

### 4.8 Keyboard Shortcuts (Desktop)
- `Ctrl+O`: Open
- `Ctrl+S`: Export
- `Ctrl+Z`: Undo
- `Ctrl+Shift+Z`: Redo
- `Ctrl+D`: Duplicate selection
- `Delete`: Delete selection
- `Escape`: Deselect / cancel
- `Space+drag`: Pan canvas
- `Ctrl+scroll`: Zoom
- `Ctrl+0`: Fit width
- `Ctrl+1`: Actual size
- `T`: Text tool
- `R`: Rectangle tool
- `E`: Ellipse tool
- `L`: Line/Arrow tool
- `H`: Highlight tool

### 4.9 Touch Gestures (Mobile)
- **Single tap**: select element
- **Double tap**: enter text edit mode
- **Long press**: context menu
- **Drag**: move element
- **Pinch**: zoom canvas
- **Two-finger pan**: pan canvas
- **Swipe left/right** on page thumbnail strip: prev/next page
- **Pull down** (on sidebar): collapse sidebar
- **Swipe up** from bottom: expand page strip

### 4.10 Search
- Search icon in toolbar
- Searches visible text across all pages
- Results shown as highlighted overlays on each page
- Navigate between results with Enter/Shift+Enter
- Match count shown

### 4.11 Export
- **Standard PDF**: preserves all edits in PDF format
- **Flattened PDF**: rasterizes annotations into page content
- **Optimized PDF**: runs pdf-lib optimization (remove unused objects, compress streams)
- Export dialog: filename input, quality slider (for images), page range selector
- Download triggers immediately, no server round-trip

---

## 5. Component Inventory

### 5.1 AppShell
The root layout. Handles theme (dark/light), responsive breakpoint detection, and global keyboard handler. Contains: TopBar, LeftSidebar, CanvasArea, RightPanel, BottomBar (mobile).

**States**: loading (splash), empty (no file open), editing (normal)

### 5.2 TopBar (Desktop)
48px height. Left: Pagecraft wordmark (Instrument Serif). Center: file name (editable on click) + modified indicator (dot). Right: Share button, Export dropdown, Settings gear, theme toggle.

**States**: default, editing-filename, unsaved-changes (dot appears)

### 5.3 LeftSidebar (Desktop)
240px width. Top section: page count + add-page button. Body: virtualized scrollable list of PageThumbnails. Collapse button at bottom.

**States**: expanded, collapsed (48px, icon-only)

### 5.4 PageThumbnail
Mini render of a single PDF page (pdf.js render at 0.3x scale). Shows page number label. Draggable for reorder.

**States**: default, selected (accent border), hover (slight scale), dragging (lifted shadow, semi-transparent), drop-target (accent line indicator)

### 5.5 CanvasArea
The main editing surface. Virtualized rendering — only visible pages + 2 buffer pages rendered. Uses CSS transform for zoom. PageContainer elements are absolutely positioned within.

**States**: default, panning (grab cursor), text-editing (cursor: text)

### 5.6 PageContainer
Wrapper for a single page's rendering + all its editable objects. Handles selection state, zoom transform, and resize handles.

**States**: default, selected (shows page border), editing-text (textarea overlay visible)

### 5.7 TextEditOverlay
Absolutely positioned `<textarea>` that appears over text during inline editing. Auto-sized to match original text bounding box. Monospace-matching font, transparent background, accent underline caret.

**States**: active (editing), committing (saving), cancelled

### 5.8 SelectionHandles
8 resize handles (corners + midpoints) + 1 rotation handle (arc above top-center). SVG overlay on selected element.

**States**: visible, hidden, resizing, rotating

### 5.9 ToolBar (Desktop)
Left side of TopBar. Icon buttons for: Select (V), Text (T), Rectangle (R), Ellipse (E), Line (L), Highlight (H), Sticky Note (N), Draw (D), Image (I), Comment (C). Active tool highlighted with accent.

**States**: default tool selected, active (tool options visible in right panel)

### 5.10 ToolFAB (Mobile)
Center-bottom floating cluster. Single circle button (48px) → expands radially to 6 tool options. Tools: Select, Text, Draw, Highlight, Shapes, More.

**States**: collapsed, expanded (radial menu)

### 5.11 BottomSheet (Mobile)
Sliding panel from bottom. Three modes: Pages (horizontal thumbnail strip), Properties (contextual tool options), Tool Options (for active tool).

**States**: collapsed (80px peek), partial (40%), full (90%)

### 5.12 RightPanel (Desktop)
280px width. Contextual content based on selection:
- No selection: Page properties (size, rotation)
- Text selected: Font, size, color, alignment, weight
- Image selected: Opacity, dimensions, replace/delete
- Annotation: color, opacity, delete

**States**: empty, page-props, text-props, image-props, annotation-props, collapsed

### 5.13 ZoomControl (Floating)
Bottom-right corner of canvas. Shows current zoom % + buttons for: zoom in, zoom out, fit width, actual size. Collapses to a single % indicator on mobile.

### 5.14 UndoPill (Floating)
Top-center of canvas, 32px from top. Shows: undo icon, action label ("Deleted text"), redo icon. Fades to 30% opacity after 3 seconds of inactivity. Full opacity on hover.

### 5.15 ExportDialog
Modal dialog. Fields: filename, format selector (PDF / Flattened / Optimized), page range (all / current / custom), image quality slider. Preview of file size estimate.

**States**: idle, exporting (spinner), done (auto-dismiss)

### 5.16 ContextMenu
Right-click menu (desktop) / long-press menu (mobile). Contextual items based on selection: Copy, Cut, Paste, Delete, Duplicate, Bring Forward, Send Backward, Replace Image, Edit Text, Add Comment.

### 5.17 CommandPalette (Desktop)
Ctrl+K to open. Full-text search across: tools, actions, pages, bookmarks. Keyboard navigable. Shows recent actions and page thumbnails in results.

---

## 6. Technical Approach

### 6.1 Monorepo Structure

```
pdf-editor/
├── apps/
│   └── web/                      # Next.js 14 (App Router) frontend
│       ├── app/
│       │   ├── layout.tsx        # Root layout, theme provider
│       │   ├── page.tsx         # Main editor page
│       │   ├── open/            # File open page
│       │   └── globals.css
│       ├── components/
│       │   ├── ui/              # shadcn/ui base components
│       │   ├── layout/          # AppShell, TopBar, Sidebar, Canvas
│       │   ├── tools/           # Tool buttons, tool state machine
│       │   ├── canvas/          # CanvasArea, PageContainer, zoom
│       │   ├── annotations/     # Highlight, Comment, StickyNote, etc.
│       │   ├── panels/          # RightPanel, PropertiesPanel
│       │   ├── mobile/           # BottomSheet, ToolFAB, MobileNav
│       │   └── dialogs/         # Export, Settings, CommandPalette
│       ├── hooks/
│       │   ├── usePdfDocument.ts
│       │   ├── useSelection.ts
│       │   ├── useTool.ts
│       │   ├── useHistory.ts     # Undo/redo
│       │   ├── useCanvas.ts
│       │   └── useMobileGestures.ts
│       ├── stores/
│       │   ├── documentStore.ts  # Zustand: pages, objects, selection
│       │   ├── toolStore.ts      # Active tool, tool options
│       │   ├── uiStore.ts        # Panels, zoom, theme
│       │   └── historyStore.ts  # Undo/redo stack
│       └── lib/
│           ├── utils.ts
│           └── constants.ts
├── packages/
│   └── pdf-engine/               # Core PDF editing engine
│       ├── src/
│       │   ├── index.ts          # Public API
│       │   ├── Document.ts       # PDF document model
│       │   ├── Page.ts           # Page model
│       │   ├── objects/          # TextObject, ImageObject, AnnotationObject
│       │   ├── parser/           # PDF stream parser
│       │   ├── editor/           # Object stream editor
│       │   ├── renderer/         # PDF.js render orchestration
│       │   ├── exporter/         # PDF serialization + optimization
│       │   └── utils/
│       ├── package.json
│       └── tsconfig.json
├── package.json                  # Workspace root
├── tsconfig.base.json
├── turbo.json                    # Turborepo config
└── SPEC.md
```

### 6.2 PDF Engine API (packages/pdf-engine)

The engine is the core differentiator. It provides a high-level object model over raw PDF structures.

```typescript
// Public API shape
import { PdfEngine } from '@pagecraft/pdf-engine';

const engine = new PdfEngine();
await engine.load(arrayBuffer: ArrayBuffer): PdfDocument

// Document
doc.getPages(): Page[]
doc.getPage(index: number): Page
doc.addPage(afterIndex?: number, size?: {width, height}): Page
doc.deletePage(index: number): void
doc.reorderPages(fromIndex: number, toIndex: number): void
doc.save(options?: ExportOptions): Promise<ArrayBuffer>

// Page
page.getObjects(): PdfObject[]
page.renderToCanvas(canvas: HTMLCanvasElement, scale: number): Promise<void>
page.addAnnotation(annotation: AnnotationObject): string  // returns id
page.removeAnnotation(id: string): void

// Text editing (real object stream editing)
textObj.getContent(): string
textObj.setContent(newText: string): void        // mutates stream
textObj.getStyle(): TextStyle                     // font, size, color, etc.
textObj.setStyle(style: Partial<TextStyle>): void
textObj.getBBox(): BoundingBox
textObj.updateStream(): void                      // recalculates appearance

// Image
imgObj.getSrc(): string  // base64 data URL
imgObj.setSrc(base64: string): void
imgObj.getBBox(): BoundingBox
imgObj.setBBox(bbox: BoundingBox): void
imgObj.setOpacity(n: number): void

// Annotations
annotation.getContents(): string
annotation.setContents(text: string): void
annotation.setColor(hex: string): void
annotation.setRect(rect: Rect): void
```

### 6.3 Rendering Pipeline

1. **pdf.js** renders the PDF page to a canvas at the current zoom level (e.g., 1.5x for retina)
2. **Engine** parses the PDF's object streams and builds the `PdfDocument` object model
3. Each page's objects (text, images, annotations) are overlaid as absolutely-positioned HTML/SVG elements
4. On text edit: the engine mutates the PDF object stream directly → pdf.js re-renders only the affected page region
5. Virtualization: only pages within the viewport ± 2 buffer pages render to canvas
6. Worker thread: PDF parsing and stream manipulation happens in a Web Worker to avoid UI blocking

### 6.4 State Management (Zustand)

```
documentStore:
  - pdfDocument: PdfDocument | null
  - pages: PageState[]       // rendered state, not raw PDF
  - selectedObjectIds: string[]
  - history: HistoryStack
  - isDirty: boolean

toolStore:
  - activeTool: ToolType
  - toolOptions: ToolOptions
  - isDrawing: boolean

uiStore:
  - zoom: number
  - panOffset: {x, y}
  - theme: 'dark' | 'light'
  - leftSidebarOpen: boolean
  - rightPanelOpen: boolean
  - activePanel: 'pages' | 'properties' | 'comments'
```

### 6.5 Local Storage

**IndexedDB** via `idb` library:
- `documents` store: key = file hash, value = full ArrayBuffer (for recent files)
- `autosave` store: key = current doc id, value = serialized state snapshot (every 5s if dirty)
- `preferences` store: theme, last zoom, recent files list

### 6.6 Libraries

| Purpose | Library |
|---|---|
| PDF parsing/rendering | pdf.js (mozilla/pdfjs-dist) |
| PDF manipulation | pdf-lib |
| Canvas interactions | Konva.js (or raw canvas for perf) |
| State management | Zustand |
| UI components | shadcn/ui + Radix primitives |
| Styling | Tailwind CSS |
| Animation | Framer Motion |
| Gestures | @use-gesture/react |
| Virtualization | @tanstack/react-virtual |
| IndexedDB | idb |
| PDF text extraction | pdf.js built-in |
| Icons | Lucide React |
| File handling | Browser File API + drag-and-drop |

### 6.7 Performance Strategy

- **Virtualization**: only render visible pages + buffer. 1000-page PDF only renders 3-5 pages.
- **Web Workers**: PDF parsing and stream serialization off main thread
- **Canvas offscreen**: pdf.js renders to OffscreenCanvas in worker
- **Debounced autosave**: 5s debounce on state changes to IndexedDB
- **Lazy tool loading**: annotation tools loaded only when tool selected
- **Image lazy-load**: images outside viewport show low-res placeholder
- **Target**: <100ms interaction response, <2s initial page render for 50MB PDF

### 6.8 Mobile Optimization

- `touch-action: none` on canvas to prevent browser gestures conflicting with app
- Passive touch event listeners where possible
- `will-change: transform` on draggable elements
- RAF-throttled gesture handlers
- Bottom-sheet implemented with `react-spring` or Framer Motion
- Safe area insets respected on notched devices

---

## 7. Implementation Roadmap

### Phase 1: Foundation (R1–R10)
- [ ] Monorepo setup (Turborepo + Next.js + TypeScript)
- [ ] Design system: CSS variables, typography, color tokens
- [ ] shadcn/ui installation + base components customized to design system
- [ ] AppShell layout: responsive grid, theme provider
- [ ] Dark/light mode toggle
- [ ] PDF engine package scaffold + pdf.js integration
- [ ] Basic PDF rendering (first page, no editing)
- [ ] Page navigation (prev/next, page indicator)
- [ ] Zoom controls (slider, fit-width, actual size)
- [ ] File open: drag-drop + file picker
- [ ] Page thumbnails in sidebar
- [ ] IndexedDB autosave

### Phase 2: Text Editing (R11–R20)
- [ ] PDF object model: TextObject, ImageObject classes
- [ ] Object stream parser: extract text + positions from PDF
- [ ] Click-to-edit: inline textarea overlay
- [ ] Object stream mutation: setContent() writes back to PDF
- [ ] Font/style preservation on edit
- [ ] Text style panel (font, size, color, bold, italic, alignment)
- [ ] Multi-page text editing
- [ ] Keyboard navigation between text objects (Tab)

### Phase 3: Selection & Manipulation (R21–R28)
- [ ] Object selection (click to select, shift-click multi)
- [ ] Selection handles: resize, rotate
- [ ] Move objects (drag)
- [ ] Delete objects
- [ ] Duplicate objects
- [ ] Keyboard shortcuts (Delete, Ctrl+D, Escape)
- [ ] Context menu (right-click / long-press)
- [ ] Copy/paste objects

### Phase 4: Page Management (R29–R34)
- [ ] Add/delete/reorder pages
- [ ] Rotate pages
- [ ] Crop pages
- [ ] Resize pages
- [ ] Page properties panel
- [ ] Drag-and-drop page reorder in sidebar

### Phase 5: Annotations (R35–R42)
- [ ] Highlight tool
- [ ] Underline/strikethrough
- [ ] Sticky notes
- [ ] Comment annotations
- [ ] Freehand drawing (brush tool)
- [ ] Shapes (rectangle, ellipse, arrow, line)
- [ ] Text boxes
- [ ] Annotation color + opacity controls

### Phase 6: Images (R43–R47)
- [ ] Image selection
- [ ] Resize/rotate/crop
- [ ] Replace image
- [ ] Add new image
- [ ] Image properties (opacity, quality)

### Phase 7: History & Polish (R48–R52)
- [ ] Undo/redo with operation stack
- [ ] Undo pill UI
- [ ] Command palette (Ctrl+K)
- [ ] Search across pages
- [ ] Keyboard shortcut overlay (?)

### Phase 8: Export & Mobile (R53–R58)
- [ ] Export dialog (PDF, flattened, optimized)
- [ ] Mobile bottom sheet UI
- [ ] Mobile tool FAB
- [ ] Touch gestures (pinch, pan, long-press)
- [ ] Mobile export / share
- [ ] Light mode refinement

### Phase 9: Polish & Launch (R59–R60)
- [ ] Performance pass (virtualization, lazy-load)
- [ ] Accessibility audit (ARIA, keyboard nav)
- [ ] Final UI polish pass
- [ ] README + documentation

---

## 8. Technical Challenges & Solutions

| Challenge | Solution |
|---|---|
| Font substitution without layout break | Embed Noto Sans with matching metrics; preserve exact glyph widths |
| Rotated text editing | Parse Tm (text matrix) from stream; edit in transformed space; write back with same matrix |
| Multi-column text reflow | Detect text positions to identify columns; edit per-column, preserve column boundaries |
| Large PDF performance | Virtualized rendering (only visible + buffer pages); Web Worker for parsing |
| Annotation serialization | Write as native PDF annotation objects (not canvas drawings) so they're selectable/editable |
| Mobile touch conflicts | `touch-action: none` + gesture library handles all conflicts |
| Edit undo/redo without snapshots | Operation-based history: each action has an `apply()` and `revert()` function |
| PDF stream integrity | pdf-lib handles object serialization; validate checksum after mutation |
| Memory on large PDFs | Release canvas for off-screen pages; use `createImageBitmap` for faster canvas transfers |

---

## 9. Known Constraints

- **Browser support**: Chrome 90+, Firefox 90+, Safari 15+, Edge 90+. No IE.
- **Client-side only**: no server processing. All PDF ops in browser via WASM/JS.
- **Font embedding**: if a PDF uses a proprietary font with no subset embedded, exact font match may not be possible. Fallback to Noto Sans with closest metric match.
- **Encrypted/password-protected PDFs**: v1 will not support password-protected PDFs. Show a clear error message.
- **PDFs with JavaScript**: v1 will strip JavaScript on export (security).
- **Real-time collaboration**: out of scope for v1. Architecture is designed to support it later.
- **Forms**: v1 will display form fields but editing form field properties is v2.
- **OCR**: out of scope for v1.
