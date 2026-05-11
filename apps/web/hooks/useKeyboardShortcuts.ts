import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useHistoryStore } from '@/stores/historyStore';
import { useObjectsStore } from '@/stores/objectsStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useToolStore } from '@/stores/toolStore';
import { useUIStore } from '@/stores/uiStore';
import { useDocumentStore } from '@/stores/documentStore';

interface ContextMenuPosition { x: number; y: number }

interface UseKeyboardShortcutsProps {
  handleDeleteSelected: () => void;
  handleCommandPaletteToggle: () => void;
  showShortcuts: boolean;
  setShowShortcuts: Dispatch<SetStateAction<boolean>>;
  setContextMenu: Dispatch<SetStateAction<ContextMenuPosition | null>>;
  activePageIndex: number;
  pages: Array<{ getWidth?: () => number; getHeight?: () => number }>;
}

export function useKeyboardShortcuts({
  handleDeleteSelected,
  handleCommandPaletteToggle,
  showShortcuts,
  setShowShortcuts,
  setContextMenu,
  activePageIndex,
  pages,
}: UseKeyboardShortcutsProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      const { undo, redo } = useHistoryStore.getState();
      const { copySelected, duplicateSelected, pasteClipboard } = useObjectsStore.getState();
      const { clearSelection, selectedObjects } = useSelectionStore.getState();

      if (isMod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (isMod && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); return; }
      if (isMod && e.key === 'y') { e.preventDefault(); redo(); return; }
      if (isMod && e.key === 'd') { e.preventDefault(); duplicateSelected(); return; }
      if (isMod && e.key === 'c') { e.preventDefault(); copySelected(); return; }
      if (isMod && e.key === 'v') {
        e.preventDefault();
        const addImageObject = useObjectsStore.getState().addImageObject;
        const addTextObject = useObjectsStore.getState().addTextObject;
        navigator.clipboard.read().then(async (items) => {
          for (const item of items) {
            const imageType = item.types.find((t) => t.startsWith('image/'));
            if (imageType) {
              const blob = await item.getType(imageType);
              const dataUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
              const img = new Image();
              img.onload = () => {
                const page = pages[activePageIndex];
                const pageWidth = page?.getWidth?.() ?? 612;
                const pageHeight = page?.getHeight?.() ?? 792;
                addImageObject({
                  id: `img-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  pageIndex: activePageIndex,
                  x: pageWidth / 2 - img.width / 2,
                  y: pageHeight / 2 - img.height / 2,
                  width: img.width,
                  height: img.height,
                  src: dataUrl,
                  rotation: 0,
                  objectRef: '',
                });
              };
              img.src = dataUrl;
              return;
            }
          }
          const text = await navigator.clipboard.readText();
          if (text) {
            const page = pages[activePageIndex];
            const pageWidth = page?.getWidth?.() ?? 612;
            const pageHeight = page?.getHeight?.() ?? 792;
            addTextObject({
              id: `text-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              pageIndex: activePageIndex,
              content: text,
              x: pageWidth / 2,
              y: pageHeight / 2,
              width: 200,
              height: 50,
              fontSize: 16,
              fontFamily: 'sans-serif',
              fontWeight: 'normal',
              fontStyle: 'normal',
              color: '#000000',
              textAlign: 'left',
              rotation: 0,
              objectRef: '',
            });
          }
        }).catch(() => {
          useUIStore.getState().setToast('Clipboard access denied. Try pasting from the edit menu instead.');
          pasteClipboard();
        });
        return;
      }

      if (e.key === 'Escape') { clearSelection(); setContextMenu(null); if (showShortcuts) setShowShortcuts(false); return; }
      if (e.key === '?') { e.preventDefault(); setShowShortcuts((v) => !v); return; }
      if (isMod && e.key === 'k') { e.preventDefault(); useUIStore.getState().setCommandPaletteOpen(true); return; }

      const currentSelected = useSelectionStore.getState().selectedObjects;
      const currentTextObjects = useObjectsStore.getState().textObjects;
      const currentPageIndex = useDocumentStore.getState().activePageIndex;

      if ((e.key === 'Delete' || e.key === 'Backspace') && currentSelected.length > 0) {
        e.preventDefault();
        handleDeleteSelected();
        return;
      }

      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      if (e.key === 'Tab' && currentSelected.length > 0) {
        e.preventDefault();
        const { selectObject } = useSelectionStore.getState();
        const currentPageObjs = currentTextObjects
          .filter((o: { pageIndex: number; y: number; x: number; id: string }) => o.pageIndex === currentPageIndex)
          .sort((a: { y: number; x: number }, b: { y: number; x: number }) => a.y - b.y || a.x - b.x);
        const currentId = currentSelected[0]?.id;
        const idx = currentPageObjs.findIndex((o: { id: string }) => o.id === currentId);
        const next = e.shiftKey
          ? currentPageObjs[(idx - 1 + currentPageObjs.length) % currentPageObjs.length]
          : currentPageObjs[(idx + 1) % currentPageObjs.length];
        if (next) {
          selectObject({ id: next.id, type: 'text', pageIndex: next.pageIndex });
        }
        return;
      }

      if (isMod) return;

      const { setTool } = useToolStore.getState();
      switch (e.key.toUpperCase()) {
        case 'V': setTool('select'); break;
        case 'T': setTool('text'); break;
        case 'R': setTool('rectangle'); break;
        case 'E': setTool('ellipse'); break;
        case 'L': setTool('line'); break;
        case 'A': setTool('arrow'); break;
        case 'H': setTool('highlight'); break;
        case 'U': setTool('underline'); break;
        case 'S': setTool('strikethrough'); break;
        case 'N': setTool('sticky'); break;
        case 'C': setTool('comment'); break;
        case 'D': setTool('draw'); break;
        case 'I': setTool('image'); break;
        case 'G': setTool('signature'); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleDeleteSelected, handleCommandPaletteToggle, showShortcuts, setShowShortcuts, setContextMenu, activePageIndex, pages]);
}
