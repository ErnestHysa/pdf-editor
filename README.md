# Pagecraft — Web-Based PDF Editor

A modern, browser-based PDF editor built with Next.js, TypeScript, and pdf-lib. Edit text, images, annotations, and pages directly in your browser.

## Features

### Core Editing
- **True text editing** — click any text in the PDF and edit it inline
- **Text creation** — add new text boxes with the T tool
- **Font controls** — change font family, size, color, weight, alignment

### Annotations
- **Highlight, underline, strikethrough** — mark up text
- **Sticky notes & comments** — add feedback to any area
- **Freehand drawing** — pen tool for freeform marks
- **Shapes** — rectangles, circles, arrows, lines
- **Color picker** — full color control for all annotation types

### Images
- **Select & manipulate** — move, resize, rotate images in the PDF
- **Replace images** — swap an existing image with a new one
- **Add new images** — insert images from file or drag-and-drop
- **Opacity control** — adjust transparency

### Page Management
- **Rotate pages** — 90°, 180°, 270° rotation
- **Reorder pages** — drag-and-drop thumbnails in the sidebar
- **Delete pages** — remove unwanted pages
- **Insert pages** — add blank pages or from another PDF
- **Page thumbnails** — visual navigation panel

### Export Options
- **Download PDF** — save with all edits preserved
- **Flattened PDF** — merge annotations into the page content
- **Optimized PDF** — compressed, smaller file size
- **PNG / JPEG** — export individual pages as images

### UX Features
- **⌘K command palette** — quick access to all tools and actions
- **? keyboard shortcuts** — full keyboard navigation
- **Undo/Redo** — with pill indicator showing last action
- **Autosave** — changes saved to IndexedDB automatically
- **Dark / Light mode** — toggle with the sun/moon button

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, TailwindCSS, Zustand
- **PDF Rendering**: pdf.js (Mozilla)
- **PDF Manipulation**: pdf-lib
- **Canvas**: Custom canvas layer with Fabric.js-style handles
- **Storage**: IndexedDB (browser-local autosave)

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev
# → http://localhost:3000

# Build for production
npm run build
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| V | Select tool |
| T | Text tool |
| H | Highlight |
| U | Underline |
| S | Strikethrough |
| R | Rectangle |
| O | Circle/ellipse |
| L | Line |
| A | Arrow |
| P | Freehand pen |
| N | Sticky note |
| Delete | Delete selected |
| Ctrl+D | Duplicate |
| Ctrl+C / Ctrl+V | Copy / Paste |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| Tab / Shift+Tab | Navigate objects |
| ? | Show shortcuts |

## Architecture

```
apps/web/
  app/                    # Next.js app router
  components/
    canvas/               # PageCanvas, ZoomControl, SelectionHandles, etc.
    layout/              # EditorPage, TopBar, LeftSidebar, RightPanel
    mobile/              # ToolFAB, MobileBottomSheet
    panels/              # RightPanel (text/image/annotation properties)
    ui/                  # CommandPalette, UndoRedoPill, KeyboardShortcutsOverlay
  hooks/
    usePdfExporter.ts   # Export PDF/PNG/JPEG with changes
    usePdfParser.ts     # Parse PDF into text/annotation objects
    useAutosave.ts      # IndexedDB persistence
  stores/
    documentStore.ts     # PDF pages, text objects, annotations, images
    uiStore.ts          # Zoom, pan, sidebar, theme
    toolStore.ts        # Active tool, tool options
    historyStore.ts     # Undo/redo history
packages/pdf-engine/     # Core PDF parsing (PdfDocument, TextObject, etc.)

```

## License

MIT
