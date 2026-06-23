/**
 * data-io.ts — Pure utility functions for form data import/export.
 * Supports JSON, CSV, FDF (PDF Forms Data Format), and XFDF (XML Forms Data Format).
 * No React/DOM dependencies.
 */

export type FieldType = 'text' | 'checkbox' | 'radio' | 'choice' | 'listbox' | 'button' | 'signature';

/** Minimal form field shape used for import/export round-tripping */
export interface FormFieldRecord {
  id?: string;
  name: string;
  type: FieldType;
  value?: string | boolean | string[];
  pageIndex?: number;
}

/**
 * Export an array of form fields to a string in the given format.
 * JSON:  [{id, name, type, value, pageIndex}, ...]
 * CSV:   id,name,type,value,pageIndex  (header + rows)
 * FDF:   PDF Forms Data Format (application/x-fdf)
 * XFDF:  XML-based form data format
 */
export function exportFormData(
  fields: FormFieldRecord[],
  format: 'json' | 'csv' | 'fdf' | 'xfdf'
): string {
  switch (format) {
    case 'json':
      return exportAsJson(fields);
    case 'csv':
      return exportAsCsv(fields);
    case 'fdf':
      return exportAsFdf(fields);
    case 'xfdf':
      return exportAsXfdf(fields);
    default:
      throw new Error(`Unknown export format: ${format}`);
  }
}

/**
 * Import form data from a string in the given format.
 * Returns a Partial<FormFieldRecord>[] — fields may be partial records.
 */
export function importFormData(
  data: string,
  format: 'json' | 'csv' | 'fdf' | 'xfdf'
): Partial<FormFieldRecord>[] {
  switch (format) {
    case 'json':
      return importFromJson(data);
    case 'csv':
      return importFromCsv(data);
    case 'fdf':
      return importFromFdf(data);
    case 'xfdf':
      return importFromXfdf(data);
    default:
      throw new Error(`Unknown import format: ${format}`);
  }
}

// ─── JSON ───────────────────────────────────────────────────────────────────

function exportAsJson(fields: FormFieldRecord[]): string {
  const records = fields.map((f) => ({
    id: f.id ?? f.name,
    name: f.name,
    type: f.type,
    value: f.value,
    pageIndex: f.pageIndex,
  }));
  return JSON.stringify(records, null, 2);
}

function importFromJson(data: string): Partial<FormFieldRecord>[] {
  const parsed = JSON.parse(data);
  return parsed.map((r: Record<string, unknown>) => ({
    id: r['id'] as string | undefined,
    name: r['name'] as string,
    type: r['type'] as FieldType,
    value: r['value'] as string | boolean | string[] | undefined,
    pageIndex: r['pageIndex'] as number | undefined,
  }));
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

function escapeCsvField(val: unknown): string {
  const str = val == null ? '' : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function exportAsCsv(fields: FormFieldRecord[]): string {
  const header = ['id', 'name', 'type', 'value', 'pageIndex'].join(',');
  const rows = fields.map((f) => {
    const id = f.id ?? f.name;
    const value = Array.isArray(f.value)
      ? JSON.stringify(f.value)
      : String(f.value ?? '');
    return [escapeCsvField(id), escapeCsvField(f.name), escapeCsvField(f.type),
            escapeCsvField(value), escapeCsvField(f.pageIndex)].join(',');
  });
  return [header, ...rows].join('\n');
}

function importFromCsv(data: string): Partial<FormFieldRecord>[] {
  const lines = data.split('\n').filter((l) => l.trim() !== '');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const records: Partial<FormFieldRecord>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const obj: Partial<FormFieldRecord> = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j] as keyof FormFieldRecord;
      let val: unknown = values[j] ?? '';
      if (key === 'value') {
        // Try to parse JSON array for listbox
        if (val.startsWith('[')) {
          try { val = JSON.parse(val as string); } catch { /* keep as string */ }
        }
        // Parse booleans
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
      }
      if (key === 'pageIndex') val = val === '' ? undefined : Number(val);
      Object.assign(obj, { [key]: val });
    }
    records.push(obj);
  }
  return records;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { result.push(current); current = ''; }
      else current += ch;
    }
  }
  result.push(current);
  return result;
}

// ─── FDF ─────────────────────────────────────────────────────────────────────
// PDF Forms Data Format (application/x-fdf) — Adobe's legacy field value format.
// Content-Type: application/x-fdf

function exportAsFdf(fields: FormFieldRecord[]): string {
  const entries = fields.map((f) => {
    const escapedName = escapeXmlEntities(f.name);
    const value = fieldValueToString(f.value);
    return `  <field name="${escapedName}">\n    <value>${escapeXmlEntities(value)}</value>\n  </field>`;
  }).join('\n');

  return [
    '%FDF-1.4',
    '<<',
    '/FDF <<',
    '/Fields [',
    entries,
    '  ]',
    '>>',
    '>>',
    '%%EOF',
  ].join('\n');
}

function importFromFdf(data: string): Partial<FormFieldRecord>[] {
  const records: Partial<FormFieldRecord>[] = [];
  // Strip header comments and %%EOF
  const cleaned = data.replace(/^%[^\n]*\n/gm, '').replace(/%%EOF\s*$/, '').trim();
  // Extract <field name="..."> blocks
  const fieldMatches = cleaned.matchAll(/<field\s+name="([^"]*)"[^>]*>([\s\S]*?)<\/field>/gi);
  for (const m of fieldMatches) {
    const name = unescapeXmlEntities(m[1]);
    const block = m[2];
    const valueMatch = block.match(/<value>([\s\S]*?)<\/value>/i);
    const valueStr = valueMatch ? valueMatch[1].trim() : '';
    const value = parseFdfValue(valueStr);
    records.push({ name, value });
  }
  return records;
}

function parseFdfValue(val: string): string | boolean | string[] | undefined {
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val.startsWith('[') && val.endsWith(']')) {
    try { return JSON.parse(val.replace(/'/g, '"')); } catch { /* fall through */ }
  }
  return val || undefined;
}

// ─── XFDF ────────────────────────────────────────────────────────────────────
// XML-based Forms Data Format — the XML successor to FDF.

function exportAsXfdf(fields: FormFieldRecord[]): string {
  const fieldNodes = fields.map((f) => {
    const escapedName = escapeXmlEntities(f.name);
    const value = fieldValueToString(f.value);
    const typeAttr = escapeXmlEntities(f.type);
    return `  <field name="${escapedName}" type="${typeAttr}">\n    <value>${escapeXmlEntities(value)}</value>\n  </field>`;
  }).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<xfdf xmlns="http://ns.adobe.com/xfdf/" xml:space="preserve">',
    '  <fields>',
    fieldNodes,
    '  </fields>',
    '</xfdf>',
  ].join('\n');
}

function importFromXfdf(data: string): Partial<FormFieldRecord>[] {
  const records: Partial<FormFieldRecord>[] = [];
  // Find all <field ...> elements
  const fieldMatches = data.matchAll(/<field\s+name="([^"]*)"\s+type="([^"]*)"[^>]*>([\s\S]*?)<\/field>/gi);
  for (const m of fieldMatches) {
    const name = unescapeXmlEntities(m[1]);
    const typeStr = m[2];
    const block = m[3];
    const valueMatch = block.match(/<value>([\s\S]*?)<\/value>/i);
    const valueStr = valueMatch ? valueMatch[1].trim() : '';
    let value: string | boolean | string[] | undefined = valueStr;
    if (valueStr === 'true' || valueStr === 'false') {
      value = valueStr === 'true';
    } else if (valueStr.startsWith('[')) {
      try { value = JSON.parse(valueStr.replace(/'/g, '"')); } catch { /* keep as string */ }
    }
    records.push({ name, type: typeStr as FieldType, value });
  }
  return records;
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

function fieldValueToString(val: string | boolean | string[] | undefined): string {
  if (val == null) return '';
  if (Array.isArray(val)) return JSON.stringify(val);
  return String(val);
}

function escapeXmlEntities(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXmlEntities(str: string): string {
  return str
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}