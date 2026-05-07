// Type declarations for pdfjs-dist/legacy subpath
// pdfjs-dist v3.11.174 includes a legacy/ subdirectory but its package.json
// does not declare it in "exports" or "types" — this declaration silences
// TypeScript while allowing the runtime import to work.
declare module 'pdfjs-dist/legacy' {
  export * from 'pdfjs-dist';
  export { GlobalWorkerOptions } from 'pdfjs-dist';
}
