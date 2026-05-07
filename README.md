# Pagecraft

A precision web-based PDF editor. Edit text, images, annotations, and more — all in your browser.

## Architecture

```
pdf-editor/
├── apps/web/               # Next.js 14 frontend
│   ├── app/               # App Router pages
│   ├── components/        # React components
│   ├── hooks/             # Custom React hooks
│   ├── stores/            # Zustand state stores
│   └── lib/               # Utilities + constants
└── packages/pdf-engine/    # Core PDF editing engine
    └── src/               # TypeScript engine
```

## Setup

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, TailwindCSS, shadcn/ui, Framer Motion
- **State**: Zustand (with immer)
- **PDF Engine**: pdf-lib + pdf.js (client-side)
- **Canvas**: Konva.js
- **Gestures**: @use-gesture/react
- **Storage**: IndexedDB (local only)

## Design Principles

- Dark-first (warm off-white light mode available)
- Editorial typography: DM Sans + Instrument Serif
- Warm terracotta accent (#C97B3E)
- Desktop: 3-column Figma-style layout
- Mobile: Bottom sheet + radial FAB tool selector
- All processing client-side — no server required

## Roadmap

See SPEC.md for the full implementation roadmap.

Phases 1-9 covering: Foundation → Text Editing → Selection → Page Management → Annotations → Images → History → Export/Mobile → Polish.
