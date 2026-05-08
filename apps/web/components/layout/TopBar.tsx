'use client';
import { useState, useEffect } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useHistoryStore } from '@/stores/historyStore';
import {
  Sun, Moon, Download, Share2, Settings, PanelLeft, PanelRight,
  Undo2, Redo2, FileText, Plus, Save, ChevronDown, Image, FileArchive, Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDeviceType } from '@/hooks/useDeviceType';
import {
  downloadPdfWithChanges,
  downloadPdfFlattened,
  downloadPdfOptimized,
  downloadPageAsPng,
  downloadPageAsJpeg,
} from '@/hooks/usePdfExporter';

export function TopBar() {
  const { theme, toggleTheme, toggleLeftSidebar, toggleRightPanel } = useUIStore();
  const { undo, redo, canUndo, canRedo, getLastAction } = useHistoryStore();
  const { fileName, isDirty, pdfDocument, activePageIndex } = useDocumentStore();
  const deviceType = useDeviceType();
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const lastAction = getLastAction();

  // Clear error after 3 seconds
  useEffect(() => {
    if (exportError) {
      const timer = setTimeout(() => setExportError(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [exportError]);

  const handleExport = async (type: string) => {
    setExportMenuOpen(false);
    setExporting(type);
    setExportError(null);
    try {
      switch (type) {
        case 'pdf':
          await downloadPdfWithChanges();
          break;
        case 'flattened':
          await downloadPdfFlattened();
          break;
        case 'optimized':
          await downloadPdfOptimized();
          break;
        case 'png':
          await downloadPageAsPng(activePageIndex);
          break;
        case 'jpeg':
          await downloadPageAsJpeg(activePageIndex);
          break;
      }
    } catch (err) {
      console.error('Export failed:', err);
      setExportError('Export failed. Please try again.');
    } finally {
      setExporting(null);
    }
  };

  return (
    <header
      className="h-12 flex items-center px-3 gap-2 border-b border-border bg-bg-surface shrink-0"
      style={{ height: '48px' }}
    >
      {/* Left section */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={toggleLeftSidebar}
          className="p-1.5 rounded-sm hover:bg-bg-hover text-text-secondary transition-colors"
          title="Toggle sidebar"
          aria-label="Toggle left sidebar"
        >
          <PanelLeft size={16} />
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2 mr-2">
          <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="6" fill="var(--accent)"/>
            <path d="M8 8h10l6 6v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z" fill="none" stroke="var(--text-primary)" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M18 8v6h6" fill="none" stroke="var(--text-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M11 17h10M11 20h7" stroke="var(--text-primary)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span className="font-serif text-base tracking-tight text-text-primary">
            Pagecraft
          </span>
        </div>

        {/* File name */}
        {pdfDocument && (
          <div className="flex items-center gap-1.5">
            <FileText size={13} className="text-text-tertiary" />
            <span className="text-sm text-text-secondary truncate max-w-[200px]">
              {fileName}
            </span>
            {isDirty && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" title="Unsaved changes" />
            )}
          </div>
        )}
      </div>

      {/* Center — undo/redo */}
      <div className="flex-1 flex items-center justify-center gap-1">
        {pdfDocument && (
          <div className="undo-pill flex items-center gap-1 px-2 py-1 rounded-full">
            <button
              onClick={undo}
              disabled={!canUndo()}
              className={cn(
                'p-1 rounded transition-colors',
                canUndo() ? 'hover:bg-bg-hover text-text-primary' : 'text-text-tertiary'
              )}
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
            >
              <Undo2 size={14} />
            </button>
            {lastAction && (
              <span className="text-xs text-text-tertiary px-1 max-w-[120px] truncate">
                {lastAction.label}
              </span>
            )}
            <button
              onClick={redo}
              disabled={!canRedo()}
              className={cn(
                'p-1 rounded transition-colors',
                canRedo() ? 'hover:bg-bg-hover text-text-primary' : 'text-text-tertiary'
              )}
              title="Redo (Ctrl+Shift+Z)"
              aria-label="Redo"
            >
              <Redo2 size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Right section */}
      <div className="flex items-center gap-1 relative">
        {pdfDocument && (
          <>
            {/* Save button */}
            <button
              onClick={() => downloadPdfWithChanges()}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-sm hover:bg-bg-hover text-text-secondary text-sm transition-colors"
              title="Save (download PDF)"
            >
              <Save size={14} />
              {deviceType !== 'mobile' && 'Save'}
            </button>

            {/* Export dropdown */}
            <div className="relative">
              <button
                onClick={() => setExportMenuOpen(!exportMenuOpen)}
                disabled={!!exporting}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-white text-sm font-medium transition-colors",
                  exporting
                    ? "bg-accent/50 cursor-not-allowed"
                    : "bg-accent hover:bg-accent-hover"
                )}
                aria-label="Export document"
              >
                {exporting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {deviceType !== 'mobile' && 'Exporting...'}
                  </>
                ) : (
                  <>
                    <Download size={14} />
                    {deviceType !== 'mobile' && 'Export'}
                    <ChevronDown size={12} />
                  </>
                )}
              </button>

              {exportMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-bg-elevated border border-border rounded-md shadow-lg z-50 py-1">
                  <button
                    onClick={() => handleExport('pdf')}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-bg-hover transition-colors"
                  >
                    <FileText size={14} />
                    Download PDF
                  </button>
                  <button
                    onClick={() => handleExport('flattened')}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-bg-hover transition-colors"
                  >
                    <FileArchive size={14} />
                    Download Flattened
                  </button>
                  <button
                    onClick={() => handleExport('optimized')}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-bg-hover transition-colors"
                  >
                    <FileArchive size={14} />
                    Download Optimized
                  </button>
                  <div className="border-t border-border my-1" />
                  <button
                    onClick={() => handleExport('png')}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-bg-hover transition-colors"
                  >
                    <Image size={14} />
                    Export Page as PNG
                  </button>
                  <button
                    onClick={() => handleExport('jpeg')}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-bg-hover transition-colors"
                  >
                    <Image size={14} />
                    Export Page as JPEG
                  </button>
                </div>
              )}
            </div>

            {/* Click outside to close */}
            {exportMenuOpen && (
              <div
                className="fixed inset-0 z-40"
                onClick={() => setExportMenuOpen(false)}
              />
            )}
          </>
        )}

        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-sm hover:bg-bg-hover text-text-secondary transition-colors"
          title="Toggle theme"
          aria-label="Toggle theme"
          aria-pressed={theme === 'dark'}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        <button
          onClick={toggleRightPanel}
          className="p-1.5 rounded-sm hover:bg-bg-hover text-text-secondary transition-colors"
          title="Toggle properties panel"
          aria-label="Toggle right sidebar"
        >
          <PanelRight size={16} />
        </button>
      </div>

      {/* Export error toast */}
      {exportError && (
        <div className="absolute right-0 top-full mt-2 px-3 py-2 bg-red-500 text-white text-sm rounded-md shadow-lg z-50">
          {exportError}
        </div>
      )}
    </header>
  );
}
