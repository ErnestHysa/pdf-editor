"use client";
import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useDocumentStore } from '@/stores/documentStore';
import { PdfParser } from '@/hooks/usePdfParser';
import { cn } from '@/lib/utils';

interface FontWarningBannerProps {
  onDismiss?: () => void;
}

export function FontWarningBanner({ onDismiss }: FontWarningBannerProps) {
  const { pdfJsDoc } = useDocumentStore();
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!pdfJsDoc || dismissed) return;

    const checkFonts = async () => {
      try {
        const parser = new PdfParser(pdfJsDoc);
        const fontWarnings = await parser.detectMissingFonts();
        setWarnings(fontWarnings);
      } catch {
        // Silently fail — no font warnings
        setWarnings([]);
      }
    };

    checkFonts();
  }, [pdfJsDoc, dismissed]);

  // Reset dismissed state when document changes
  useEffect(() => {
    setDismissed(false);
  }, [pdfJsDoc]);

  if (!pdfJsDoc || dismissed || warnings.length === 0) return null;

  const handleDismiss = () => {
    setDismissed(true);
    setDismissedKey(warnings.join('|'));
    onDismiss?.();
  };

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3',
        'bg-amber-50 dark:bg-amber-950/30',
        'border-b border-amber-200 dark:border-amber-800',
        'animate-in slide-in-from-top-2 fade-in duration-200'
      )}
    >
      <AlertTriangle
        size={16}
        className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
          Missing Fonts Detected
        </p>
        <ul className="mt-1 space-y-0.5">
          {warnings.map((warning, i) => (
            <li
              key={i}
              className="text-xs text-amber-700 dark:text-amber-300"
            >
              {warning}
            </li>
          ))}
        </ul>
      </div>
      <button
        onClick={handleDismiss}
        className="shrink-0 p-1 rounded hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
        title="Dismiss"
      >
        <X size={14} className="text-amber-600 dark:text-amber-400" />
      </button>
    </div>
  );
}
