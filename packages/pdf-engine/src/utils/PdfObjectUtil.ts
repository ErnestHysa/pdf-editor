/**
 * PdfObjectUtil — low-level utilities for working with PDF object streams.
 */

/**
 * Parse a PDF content stream and extract text operators with their operands.
 * Supports: Tj, TJ, ', ", BT...ET blocks, Tm, Td, TD, T*
 */
export class PdfObjectUtil {
  // Simple tokenizer for PDF content stream operators
  static tokenizeContentStream(stream: string): Array<{ type: string; value: string }> {
    const tokens: Array<{ type: string; value: string }> = [];
    let i = 0;

    while (i < stream.length) {
      // Skip whitespace
      if (/\s/.test(stream[i])) { i++; continue; }
      // Skip comments
      if (stream[i] === '%') { while (i < stream.length && stream[i] !== '\n') i++; continue; }
      // Array start
      if (stream[i] === '[') { let depth = 1; let j = i + 1;
        while (j < stream.length && depth > 0) {
          if (stream[j] === '[') depth++;
          else if (stream[j] === ']') depth--;
          j++;
        }
        tokens.push({ type: 'array', value: stream.slice(i, j) });
        i = j; continue;
      }
      // Hex string
      if (stream[i] === '<') { let j = i + 1;
        while (j < stream.length && stream[j] !== '>') j++;
        tokens.push({ type: 'hex', value: stream.slice(i, j + 1) });
        i = j + 1; continue;
      }
      // Literal string (parens)
      if (stream[i] === '(') { let depth = 1; let j = i + 1;
        while (j < stream.length && depth > 0) {
          if (stream[j] === '(') depth++;
          else if (stream[j] === ')') depth--;
          else if (stream[j] === '\\') j++; // escape
          j++;
        }
        tokens.push({ type: 'string', value: stream.slice(i, j + 1) });
        i = j + 1; continue;
      }
      // Number
      if (/[0-9-.+]/.test(stream[i])) { let j = i;
        while (j < stream.length && /[0-9-.+eE]/.test(stream[j])) j++;
        tokens.push({ type: 'number', value: stream.slice(i, j) });
        i = j; continue;
      }
      // Name
      if (stream[i] === '/') { let j = i + 1;
        while (j < stream.length && /[^\s(){}<>\[\]/%]/.test(stream[j])) j++;
        tokens.push({ type: 'name', value: stream.slice(i, j) });
        i = j; continue;
      }
      // Operator
      if (/[A-Za-z*']/.test(stream[i])) { let j = i;
        while (j < stream.length && /[A-Za-z*']/.test(stream[j])) j++;
        tokens.push({ type: 'operator', value: stream.slice(i, j) });
        i = j; continue;
      }
      // Other
      tokens.push({ type: 'other', value: stream[i] });
      i++;
    }

    return tokens;
  }

  /**
   * Build a TJ array string from text content and font size.
   * This creates a PDF-compatible text array for the Tj operator.
   */
  static buildTjArray(text: string, fontSize: number, fontRef: string): string {
    // Simplified: encode each character as a number offset
    const glyphWidths = text.split('').map(() => fontSize * 0.6); // approximate
    const arrayStr = glyphWidths.map(w => `(${Math.round(w)}`).join(' ') + '] Tj';
    return `[${text.split('').map(c => `(${c})`).join(' ')}] TJ`;
  }

  /**
   * Extract the numeric value from a PDF number token.
   */
  static parseNumber(token: string): number {
    return parseFloat(token);
  }

  /**
   * Unescape a PDF literal string.
   */
  static unescapeString(s: string): string {
    const escapeMap: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
    return s
      .slice(1, -1)
      .replace(/\\([nrtbf()\\])/g, (_, c: string) => escapeMap[c] ?? c)
      .replace(/\\([0-9]{3})/g, (_, oct: string) => String.fromCharCode(parseInt(oct, 8)))
      .replace(/\\r/g, '\r');
  }
}
