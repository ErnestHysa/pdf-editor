'use client';
import React, { useState, useEffect } from 'react';
import { useDocumentStore } from '@/stores/documentStore';
import { X, Type, CheckSquare, CircleDot } from 'lucide-react';

interface FormFieldInfo {
  id: string;
  name: string;
  type: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'unknown';
  value: string | boolean;
  pageIndex: number;
  rect: { x: number; y: number; width: number; height: number };
  options?: string[];
}

export function FormFieldPanel() {
  const { pdfJsDoc, activePageIndex } = useDocumentStore();
  const [fields, setFields] = useState<FormFieldInfo[]>([]);
  const [selectedField, setSelectedField] = useState<FormFieldInfo | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const loadFields = async () => {
    if (!pdfJsDoc) return;
    try {
      const page = await pdfJsDoc.getPage(activePageIndex);
      const annotations = await page.getAnnotations();
      const formFields: FormFieldInfo[] = [];

      for (const ann of annotations) {
        if (ann.subtype === 'Widget') {
          const fieldType = ann.fieldType as string;
          let type: FormFieldInfo['type'] = 'unknown';
          if (fieldType === 'Tx') type = 'text';
          else if (fieldType === 'Btn') {
            const flags = (ann.fieldFlags as number) ?? 0;
            type = flags & (1 << 0) ? 'checkbox' : 'radio';
          } else if (fieldType === 'Ch') type = 'dropdown';

          const rect = ann.rect ?? [0, 0, 0, 0];
          formFields.push({
            id: ann.id ?? `field-${formFields.length}`,
            name: (ann.fieldName as string) || `Field ${formFields.length + 1}`,
            type,
            value: type === 'checkbox' ? false : (ann.fieldValue ?? ''),
            pageIndex: activePageIndex,
            rect: { x: rect[0], y: rect[1], width: rect[2] - rect[0], height: rect[3] - rect[1] },
            options: (ann.options as string[]) ?? [],
          });
        }
      }
      setFields(formFields);
    } catch (err) {
      console.warn('[FormFieldPanel] Could not load fields:', err);
    }
  };

  useEffect(() => { if (isOpen) loadFields(); }, [pdfJsDoc, activePageIndex, isOpen]);

  const handleFill = () => {
    if (!selectedField) return;
    setFields(prev => prev.map(f =>
      f.id === selectedField.id
        ? { ...f, value: selectedField.type === 'checkbox' ? editValue === 'true' : editValue }
        : f
    ));
    setSelectedField(null);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-purple-600 hover:bg-purple-700 text-white transition-colors"
      >
        <Type size={13} />
        Forms
      </button>
    );
  }

  return (
    <div className="flex flex-col bg-bg-base rounded border border-border-subtle shadow-lg w-64 max-h-96 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
        <span className="text-xs font-semibold text-text-base">Form Fields</span>
        <button onClick={() => setIsOpen(false)} className="p-0.5 rounded hover:bg-bg-subtle text-text-muted hover:text-text-base transition-colors" aria-label="Close form fields">
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {fields.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-text-muted">No form fields on this page</div>
        ) : (
          <ul className="py-1">
            {fields.map((field) => (
              <li key={field.id}>
                <button
                  onClick={() => {
                    setSelectedField(field);
                    setEditValue(field.type === 'checkbox' ? String(!!field.value) : String(field.value ?? ''));
                  }}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-bg-subtle transition-colors ${selectedField?.id === field.id ? 'bg-bg-subtle' : ''}`}
                >
                  {field.type === 'text' && <Type size={12} className="text-text-muted flex-shrink-0" />}
                  {field.type === 'checkbox' && <CheckSquare size={12} className="text-text-muted flex-shrink-0" />}
                  {field.type === 'radio' && <CircleDot size={12} className="text-text-muted flex-shrink-0" />}
                  <span className="text-xs text-text-base truncate flex-1">{field.name}</span>
                  <span className="text-xs text-text-muted capitalize">{field.type}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {selectedField && (
        <div className="border-t border-border-subtle px-3 py-3 space-y-2">
          <div className="text-xs text-text-muted truncate">{selectedField.name}</div>
          {selectedField.type === 'checkbox' ? (
            <div className="flex gap-2">
              <button onClick={() => setEditValue('true')} className={`flex-1 py-1 rounded text-xs font-medium transition-colors ${editValue === 'true' ? 'bg-green-600 text-white' : 'bg-bg-subtle text-text-base'}`}>Checked</button>
              <button onClick={() => setEditValue('false')} className={`flex-1 py-1 rounded text-xs font-medium transition-colors ${editValue === 'false' ? 'bg-green-600 text-white' : 'bg-bg-subtle text-text-base'}`}>Unchecked</button>
            </div>
          ) : (
            <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)}
              className="w-full px-2 py-1.5 text-xs rounded border border-border-subtle bg-bg-base text-text-base placeholder-text-muted focus:outline-none focus:border-accent" />
          )}
          <div className="flex gap-2">
            <button onClick={handleFill} className="flex-1 py-1.5 rounded bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors">Apply</button>
            <button onClick={() => setSelectedField(null)} className="px-3 py-1.5 rounded bg-bg-subtle hover:bg-bg-hover text-text-base text-xs transition-colors">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
