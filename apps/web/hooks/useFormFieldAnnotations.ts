"use client";
import { useState, useEffect, useRef } from "react";
import { useDocumentStore } from "@/stores/documentStore";

interface FormFieldAnnotation {
  fieldName: string;
  fieldType: string;
  rect: [number, number, number, number];
  fieldValue: string | boolean;
  options?: Array<{ displayValue: string; exportValue: string }>;
  pageIndex: number;
}

/**
 * Caches form field annotations from pdf.js getAnnotations() once per document load.
 * Returns a Map of pageIndex → FormFieldAnnotation[].
 * Both FormFieldPanel and FormFieldOverlay consume this cache to avoid
 * redundant async getAnnotations() calls on every render.
 */
export function useFormFieldAnnotations(): Map<number, FormFieldAnnotation[]> {
  const pdfJsDoc = useDocumentStore((s) => s.pdfJsDoc);
  const docId = useDocumentStore((s) => s.docId);
  const cacheRef = useRef<Map<number, FormFieldAnnotation[]>>(new Map());
  const docIdRef = useRef<string | undefined>(undefined);
  const [annotations, setAnnotations] = useState<Map<number, FormFieldAnnotation[]>>(new Map());

  useEffect(() => {
    if (!pdfJsDoc) {
      cacheRef.current = new Map();
      setAnnotations(new Map());
      return;
    }

    // If docId changed, invalidate cache (new document loaded)
    if (docIdRef.current !== docId) {
      cacheRef.current = new Map();
      docIdRef.current = docId;
    }

    (async () => {
      const fresh = new Map<number, FormFieldAnnotation[]>();

      for (let i = 0; i < pdfJsDoc.numPages; i++) {
        // Use cached result if available
        if (cacheRef.current.has(i)) {
          fresh.set(i, cacheRef.current.get(i)!);
          continue;
        }

        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const page = await pdfJsDoc.getPage(i + 1);
          const annots = await (page as any).getAnnotations() as any[];

          const fields: FormFieldAnnotation[] = [];
          for (const a of annots) {
            if (!a.rect || a.subtype !== "Widget") continue;
            fields.push({
              fieldName: a.fieldName ?? "",
              fieldType: a.fieldType ?? "Tx",
              rect: a.rect,
              fieldValue: a.fieldValue ?? "",
              options: a.options,
              pageIndex: i,
            });
          }

          cacheRef.current.set(i, fields);
          fresh.set(i, fields);
        } catch {
          fresh.set(i, []);
        }
      }

      setAnnotations(new Map(cacheRef.current));
    })();
  }, [pdfJsDoc, docId]);

  return annotations;
}