import { useCallback } from 'react';
import { useDocumentStore } from '@/stores/documentStore';
import { useObjectsStore } from '@/stores/objectsStore';

export function usePasteHandler() {
  return useCallback(async (e: React.ClipboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const doc = useDocumentStore.getState().pdfDocument;
    const activePageIndex = useDocumentStore.getState().activePageIndex;
    const addImg = useObjectsStore.getState().addImageObject;
    const addTxt = useObjectsStore.getState().addTextObject;
    const pages = doc ? doc.getPages() : [];
    const page = pages[activePageIndex];
    if (!page) return;

    const pageWidth = page.getWidth?.() ?? 612;
    const pageHeight = page.getHeight?.() ?? 792;
    const centerX = pageWidth / 2;
    const centerY = pageHeight / 2;

    // Try image first
    const imageItems = e.clipboardData?.items;
    if (imageItems) {
      for (const item of Array.from(imageItems)) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            const dataUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });

            const img = new Image();
            img.onload = () => {
              addImg({
                id: `img-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                pageIndex: activePageIndex,
                // Clamp so the pasted image stays within page bounds (issue #12)
                x: Math.max(0, Math.min(centerX - img.width / 2, pageWidth - img.width)),
                y: Math.max(0, Math.min(centerY - img.height / 2, pageHeight - img.height)),
                width: img.width,
                height: img.height,
                src: dataUrl,
                rotation: 0,
                opacity: 1,
                objectRef: '',
              });
            };
            img.src = dataUrl;
            return;
          }
        }
      }
    }

    // Try text
    const text = e.clipboardData?.getData('text/plain');
    if (text) {
      addTxt({
        id: `text-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        pageIndex: activePageIndex,
        content: text,
        x: centerX,
        y: centerY,
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
  }, []);
}