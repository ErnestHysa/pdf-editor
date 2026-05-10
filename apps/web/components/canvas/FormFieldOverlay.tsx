'use client';
import { memo, useCallback } from 'react';
import { useFormFieldAnnotations } from '@/hooks/useFormFieldAnnotations';
import { useDocumentStore } from '@/stores/documentStore';

interface FormFieldOverlayProps {
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
}

/**
 * FormFieldOverlay renders interactive HTML inputs on top of the PDF canvas
 * for each AcroForm widget annotation detected by pdf.js. Values are stored
 * in the formFieldValues Zustand store so they persist, display correctly
 * after edits, and are written back to the PDF on export (R65).
 *
 * Without this overlay, pdf.js renders form fields as static canvas content
 * that cannot be edited reactively.
 */
export const FormFieldOverlay = memo(function FormFieldOverlay({
  pageIndex,
  pageWidth,
  pageHeight,
}: FormFieldOverlayProps) {
  const formFieldValues = useDocumentStore((s) => s.formFieldValues);
  const updateFormFieldValue = useDocumentStore((s) => s.updateFormFieldValue);
  const allAnnotations = useFormFieldAnnotations();
  const pageAnnotations = allAnnotations.get(pageIndex) ?? [];

  const handleChange = useCallback((fieldName: string, value: string | boolean) => {
    updateFormFieldValue(fieldName, value);
  }, [updateFormFieldValue]);

  if (pageAnnotations.length === 0) return null;

  return (
    <>
      {pageAnnotations.map((a, idx) => {
        const [x1, y1, x2, y2] = a.rect;
        const x = x1;
        const y = pageHeight - y2; // PDF bottom-left → DOM top-left
        const width = Math.abs(x2 - x1);
        const height = Math.abs(y2 - y1);

        // Use stored value if edited, otherwise annotation's default value
        const value = (a.fieldName && a.fieldName in formFieldValues)
          ? formFieldValues[a.fieldName]
          : a.fieldValue ?? '';

        const isCheckbox = a.fieldType === 'Btn' || a.fieldType === 'Ch';
        const isRadio = a.fieldType === 'Rd';

        if (isCheckbox) {
          return (
            <div
              key={`${a.fieldName}-${idx}`}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width,
                height,
                zIndex: 30,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={Boolean(value)}
                onChange={(e) => handleChange(a.fieldName, e.target.checked)}
                style={{ width: '100%', height: '100%', cursor: 'pointer' }}
              />
            </div>
          );
        }

        if (isRadio) {
          return (
            <div
              key={`${a.fieldName}-${idx}`}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width,
                height,
                zIndex: 30,
              }}
            >
              <input
                type="radio"
                checked={Boolean(value)}
                onChange={() => handleChange(a.fieldName, value)}
                style={{ width: '100%', height: '100%', cursor: 'pointer' }}
              />
            </div>
          );
        }

        // Text field (default)
        return (
          <div
            key={`${a.fieldName}-${idx}`}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width,
              height,
              zIndex: 30,
            }}
          >
            <input
              type="text"
              value={String(value ?? '')}
              onChange={(e) => handleChange(a.fieldName, e.target.value)}
              style={{
                width: '100%',
                height: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: Math.max(8, Math.min(height - 4, 14)),
                fontFamily: 'DM Sans, sans-serif',
                color: '#000',
                cursor: 'text',
                padding: '2px 4px',
              }}
            />
          </div>
        );
      })}
    </>
  );
});