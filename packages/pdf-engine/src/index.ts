// Re-export all public APIs
export { PdfEngine } from './PdfEngine';
export type { PdfDocument } from './Document';
export type { Page } from './Page';
export type { TextObject } from './objects/TextObject';
export type { ImageObject } from './objects/ImageObject';
export type { AnnotationObject, AnnotationType } from './objects/AnnotationObject';
export type { BoundingBox, TextStyle, ExportOptions } from './types';
export { BoundingBoxUtil } from './utils/BoundingBoxUtil';

// Re-export utilities moved from apps/web
export { createNativeAnnotation, hexToRgbArray, buildStampAnnotation, DEFAULT_STAMPS, type StampAnnotation } from './annotationBuilder';
export { parseHexColor, lightenColor, makeArray } from './textExtractor';
export { glyphPreservingEdit } from './glyphEditor';
// NOTE: Despite the filename, PdfParser is a plain class (not a React hook).
// The file is named usePdfParser.ts for historical reasons.
export { type FormField, PdfParser } from './usePdfParser';
