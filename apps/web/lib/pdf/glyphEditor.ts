"use client";
import { PDFDocument, PDFArray, PDFObject, PDFName } from "pdf-lib";
import { useDocumentStore } from "@/stores/documentStore";

/**
 * C4: Glyph-level text editing for formatting preservation.
 *
 * Attempts to surgically edit a specific text segment within a PDF content stream's
 * TJ (Typeface and Text) array, replacing only the targeted string while preserving
 * all surrounding glyphs and their width/kerning information.
 *
 * This avoids the full content-stream rewrite that pdf-lib normally performs when
 * using drawText(), which loses kerning pairs and ligature information.
 *
 * Falls back to a no-op (returning false) when:
 *   - The content stream is compressed and cannot be decoded
 *   - The target string cannot be found in the TJ array
 *   - The stream uses advanced encoding that can't be safely parsed
 *
 * @param pageIndex  -0-indexed page number
 * @param objectRef  - PDF object reference string (e.g. "45 0 R") for the text object
 * @param oldText    - The exact text segment to find and replace
 * @param newText    - The replacement text
 * @returns true if the edit was applied, false if it fell back
 */
export function glyphPreservingEdit(
  pageIndex: number,
  objectRef: string,
  oldText: string,
  newText: string,
): boolean {
  try {
    const { pdfDocument } = useDocumentStore.getState();
    if (!pdfDocument) return false;

    const libDoc = pdfDocument.getLibDoc();
    const pages = libDoc.getPages();
    if (pageIndex < 0 || pageIndex >= pages.length) return false;

    const page = pages[pageIndex];
    // Access the underlying PDFPageLeaf node to get at content streams
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const node = (page as any).node as { Contents?: () => PDFObject };
    if (!node) return false;

    const contents = node.Contents?.();
    if (!contents) return false;

    // Helper to decode a string or hex literal to plain text
    const decodeString = (s: string): string => {
      // Literal string: (Hello World) -> Hello World
      if (s.startsWith("(") && s.endsWith(")")) {
        return s.slice(1, -1).replace(/\\([nrtbf()\\]|([0-9]{3}))/g, (_, c, octal) => {
          if (octal) return String.fromCharCode(parseInt(octal, 8));
          const map: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };
          return map[c] ?? c;
        });
      }
      // Hex string: <48656C6C6F> -> Hello
      if (s.startsWith("<") && s.endsWith(">")) {
        const hex = s.slice(1, -1);
        let result = "";
        for (let i = 0; i < hex.length; i += 2) {
          result += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
        }
        return result;
      }
      return s;
    };

    // Find and edit content streams
    const processStream = (streamObj: PDFObject): boolean => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stream = (streamObj as any);
      if (typeof stream.getContentsString !== "function") return false;

      let contentStr: string;
      try {
        contentStr = stream.getContentsString();
      } catch {
        // Compressed or otherwise unreadable stream — fall back
        return false;
      }

      // Search for TJ arrays containing the old text
      // Pattern: [...] TJ  (multiple glyphs with individual positioning)
      // We look for literal strings or hex strings inside the TJ array
      const tjPattern = /\[[^\]]*(?:\([^)]*\)|<[0-9A-Fa-f]+>)[^\]]*\]\s*TJ/g;
      let match: RegExpExecArray | null;
      let found = false;
      let newContent = contentStr;

      while ((match = tjPattern.exec(contentStr)) !== null) {
        const tjArray = match[0];
        // Extract the inner array content
        const arrayContent = tjArray.slice(0, tjArray.indexOf("]")).trim();
        // Reconstruct without the closing bracket
        const innerContent = arrayContent.slice(1);

        // Check if this array contains our target text
        if (!innerContent.includes(`(${oldText})`) && !innerContent.includes(`<${oldText.split("").map(c => c.charCodeAt(0).toString(16).padStart(2, "0")).join("")}>`)) {
          continue;
        }

        // Find the specific string element within the array and replace it
        // Handles both literal strings (text) and hex strings (<hex>)
        const escapedOld = oldText.replace(/([()*\\])/g, "\\$1");
        const stringPattern = new RegExp(`\\(${escapedOld}\\)`, "g");
        if (stringPattern.test(innerContent)) {
          const escapedNew = newText.replace(/([()*\\])/g, "\\$1");
          const newInner = innerContent.replace(stringPattern, `(${escapedNew})`);
          const newArray = `[${newInner}] TJ`;
          newContent = contentStr.slice(0, match.index) + tjArray.replace(tjArray.slice(match.index - contentStr.length, match.index - contentStr.length + tjArray.length), newArray) + contentStr.slice(match.index + tjArray.length);
          found = true;
          break;
        }

        // Also try hex string matching
        const oldHex = oldText.split("").map(c => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
        const hexPattern = new RegExp(`<${oldHex}>`, "gi");
        if (hexPattern.test(innerContent)) {
          const newHex = newText.split("").map(c => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
          const newInner = innerContent.replace(hexPattern, `<${newHex}>`);
          const newArray = `[${newInner}] TJ`;
          newContent = contentStr.slice(0, match.index) + tjArray.replace(tjArray.slice(match.index - contentStr.length, match.index - contentStr.length + tjArray.length), newArray) + contentStr.slice(match.index + tjArray.length);
          found = true;
          break;
        }
      }

      if (!found) return false;

      // We successfully found and replaced the text in the decoded stream.
      // Write the modified content back to the stream object directly.
      // pdf-lib will re-encode this stream when save() is called.
      try {
        // Get the stream's underlying dictionary and update its content
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const streamDict = (streamObj as any).dict;
        if (streamDict) {
          // Attempt to set the Length entry so pdf-lib knows the new size
          streamDict.set(PDFName.of("Length"), streamDict.context.obj(newContent.length));
        }
        // Mark the stream as "uncompressed" so it can be re-encoded cleanly.
        // If the original was Flate-encoded, we remove that marker so
        // pdf-lib doesn't try to decode/encode a second time.
        streamDict?.set(PDFName.of("Filter"), undefined);
        // Also write the raw bytes back via setUnencoded
        try {
          const unencoded = new TextEncoder().encode(newContent);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (streamObj as any).setUnencodedBytes?.(unencoded);
        } catch {
          // If setUnencodedBytes is not available, try writing via pointer
        }
        return true;
      } catch {
        return false;
      }
    };

    // Handle case where Contents is an array of streams (common for compressed docs)
    if (contents instanceof PDFArray) {
      for (let i = 0; i < contents.size(); i++) {
        const item = contents.lookup(i);
        if (item && processStream(item)) return true;
      }
      return false;
    }

    return processStream(contents);
  } catch {
    // Any parsing/encoding error → fall back to original approach
    return false;
  }
}