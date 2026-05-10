import { Loader2 } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy';

interface ParsingOverlayProps {
  isLoading: boolean;
  parsingProgress: number;
  pdfJsDoc: PDFDocumentProxy | null;
}

export function ParsingOverlay({ isLoading, parsingProgress, pdfJsDoc }: ParsingOverlayProps) {
  if (!isLoading && (parsingProgress === 0 || parsingProgress === 100)) return null;

  return (
    <div className="fixed inset-0 z-50 bg-bg-primary/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
      <Loader2 size={48} className="animate-spin text-text-primary" />
      {parsingProgress > 0 && parsingProgress < 100 && (
        <>
          <div className="w-48 h-2 bg-bg-base rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${parsingProgress}%` }}
            />
          </div>
          <span className="text-text-secondary text-sm">
            Parsing {Math.round(parsingProgress * (pdfJsDoc?.numPages ?? 0) / 100)} of {pdfJsDoc?.numPages ?? 0}...
          </span>
        </>
      )}
    </div>
  );
}