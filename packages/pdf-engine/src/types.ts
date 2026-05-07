export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number; // degrees
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color: string;
  textAlign: 'left' | 'center' | 'right';
  letterSpacing?: number;
  lineHeight?: number;
}

export interface ExportOptions {
  format: 'pdf' | 'flattened' | 'optimized';
  pageRange?: 'all' | 'current' | number[];
  imageQuality?: number; // 0-100
  flattenAnnotations?: boolean;
}
