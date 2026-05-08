"use client";
import { useState, useEffect, useCallback } from "react";
import { useDocumentStore } from "@/stores/documentStore";

export interface FormFieldState {
  name: string;
  type: "text" | "checkbox" | "radio" | "button";
  rect: { x: number; y: number; width: number; height: number };
  pageIndex: number;
  value: string | boolean;
  options?: string[];
  fieldName: string;
}

export function FormFieldPanel() {
  const { pdfJsDoc, setDirty, formFieldValues, updateFormFieldValue } = useDocumentStore();
  const [formFields, setFormFields] = useState<FormFieldState[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFormFields = useCallback(async () => {
    if (!pdfJsDoc) {
      setFormFields([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const fields: FormFieldState[] = [];

    try {
      for (let i = 0; i < pdfJsDoc.numPages; i++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const page = await pdfJsDoc.getPage(i + 1);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const annotations = await (page as any).getAnnotations();

        for (const ann of annotations) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const a = ann as any;
          if (!a.rect || a.subtype !== "Widget") continue;

          const typeMap: Record<string, FormFieldState["type"]> = {
            Tx: "text",
            Btn: "button",
            Ch: "checkbox",
            Rd: "radio",
          };
          const fieldType = typeMap[a.fieldType] ?? "text";

          // For checkboxes and radios, determine if checked
          let fieldValue: string | boolean = a.fieldValue ?? "";
          if (fieldType === "checkbox") {
            fieldValue = a.fieldValue === true || a.fieldValue === "Yes" || a.fieldValue === a.exportValues?.[0];
          } else if (fieldType === "radio") {
            fieldValue = a.fieldValue;
          }

          fields.push({
            name: a.fieldName ?? `field_${fields.length}`,
            type: fieldType,
            rect: {
              x: a.rect?.[0] ?? 0,
              y: a.rect?.[1] ?? 0,
              width: Math.abs((a.rect?.[2] ?? 0) - (a.rect?.[0] ?? 0)),
              height: Math.abs((a.rect?.[3] ?? 0) - (a.rect?.[1] ?? 0)),
            },
            pageIndex: i,
            value: fieldValue,
            options: a.options?.map((o: { displayValue: string; exportValue: string }) => o.displayValue),
            fieldName: a.fieldName ?? "",
          });
        }
      }
    } catch (e) {
      console.error("Error loading form fields:", e);
    }

    setFormFields(fields);
    setLoading(false);
  }, [pdfJsDoc]);

  useEffect(() => {
    loadFormFields();
  }, [loadFormFields]);

  const handleFieldChange = useCallback((fieldName: string, newValue: string | boolean) => {
    updateFormFieldValue(fieldName, newValue);
    setDirty(true);
  }, [updateFormFieldValue, setDirty]);

  /** Returns the current display value for a field — uses store value if modified */
  const getDisplayValue = useCallback((field: FormFieldState): string | boolean => {
    if (field.fieldName && field.fieldName in formFieldValues) {
      return formFieldValues[field.fieldName];
    }
    return field.value;
  }, [formFieldValues]);

  /** True if this field has been modified in the store */
  const isModified = useCallback((field: FormFieldState): boolean => {
    return field.fieldName in formFieldValues;
  }, [formFieldValues]);

  if (loading) {
    return (
      <div className="space-y-4">
        <PropertySection title="Form Fields">
          <p className="text-xs text-text-secondary">Loading form fields...</p>
        </PropertySection>
      </div>
    );
  }

  if (formFields.length === 0) {
    return (
      <div className="space-y-4">
        <PropertySection title="Form Fields">
          <p className="text-xs text-text-secondary">No form fields found</p>
        </PropertySection>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PropertySection title="Form Fields">
        <div className="space-y-3">
          {formFields.map((field, index) => (
            <div key={`${field.name}-${index}`} className="space-y-1">
              <label className="text-2xs text-text-tertiary block">
                {field.name || `Field ${index + 1}`}
                <span className="text-text-tertiary ml-1">({field.type})</span>
                {/* Unsaved indicator — yellow dot when field is modified */}
                {isModified(field) && (
                  <span
                    className="ml-2 inline-block w-2 h-2 rounded-full bg-yellow-400 align-middle"
                    title="Unsaved change"
                  />
                )}
              </label>
              {field.type === "text" && (
                <input
                  type="text"
                  value={getDisplayValue(field) as string}
                  onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
                  className="w-full bg-bg-elevated border border-border rounded px-2 py-1 text-sm text-text-primary"
                  placeholder="Enter text..."
                />
              )}
              {field.type === "checkbox" && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(getDisplayValue(field))}
                    onChange={(e) => handleFieldChange(field.fieldName, e.target.checked)}
                    className="accent-accent w-4 h-4"
                  />
                  <span className="text-sm text-text-secondary">
                    {getDisplayValue(field) ? "Checked" : "Unchecked"}
                  </span>
                </label>
              )}
              {field.type === "radio" && field.options && (
                <div className="space-y-1">
                  {field.options.map((option, optIndex) => (
                    <label key={optIndex} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name={field.name}
                        value={option}
                        checked={getDisplayValue(field) === option}
                        onChange={() => handleFieldChange(field.fieldName, option)}
                        className="accent-accent w-4 h-4"
                      />
                      <span className="text-sm text-text-secondary">{option}</span>
                    </label>
                  ))}
                </div>
              )}
              {field.type === "button" && (
                <input
                  type="text"
                  value={getDisplayValue(field) as string}
                  onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
                  className="w-full bg-bg-elevated border border-border rounded px-2 py-1 text-sm text-text-primary"
                  placeholder="Button label..."
                />
              )}
            </div>
          ))}
        </div>
      </PropertySection>
    </div>
  );
}

function PropertySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-2xs font-medium text-text-tertiary uppercase tracking-wider block mb-2">
        {title}
      </label>
      {children}
    </div>
  );
}
