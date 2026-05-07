"use client";
import { useState, useCallback } from "react";
import { useUIStore } from "@/stores/uiStore";
import { useDocumentStore } from "@/stores/documentStore";
import { SortableThumbnails } from "@/components/canvas/SortableThumbnails";
import { InsertPageDialog } from "@/components/dialogs/InsertPageDialog";
import { Plus, Trash2, Copy, FileUp, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface LeftSidebarProps {
  open: boolean;
}

export function LeftSidebar({ open }: LeftSidebarProps) {
  const { activePanel, setActivePanel } = useUIStore();
  const { pdfDocument, activePageIndex, deletePage, duplicatePage, reorderPages } =
    useDocumentStore();

  const [insertDialogOpen, setInsertDialogOpen] = useState(false);
  const [insertDialogMode, setInsertDialogMode] = useState<"blank" | "file">("blank");
  const [contextMenuPageIndex, setContextMenuPageIndex] = useState<number | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });

  const handleAddPage = useCallback(() => {
    setInsertDialogMode("blank");
    setInsertDialogOpen(true);
  }, []);

  const handleInsertFromFile = useCallback(() => {
    setInsertDialogMode("file");
    setInsertDialogOpen(true);
  }, []);

  const handleDeletePage = useCallback(
    (index: number) => {
      deletePage(index);
      setContextMenuPageIndex(null);
    },
    [deletePage]
  );

  const handleDuplicatePage = useCallback(
    (index: number) => {
      duplicatePage(index);
      setContextMenuPageIndex(null);
    },
    [duplicatePage]
  );

  const handleReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      reorderPages(fromIndex, toIndex);
    },
    [reorderPages]
  );

  const handlePageContextMenu = useCallback(
    (e: React.MouseEvent, pageIndex: number) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenuPageIndex(pageIndex);
      setContextMenuPos({ x: e.clientX, y: e.clientY });
    },
    []
  );

  const closeContextMenu = useCallback(() => {
    setContextMenuPageIndex(null);
  }, []);

  if (!open) return null;

  const pageCount = pdfDocument?.getPageCount() ?? 0;
  const canDelete = pageCount > 1;

  return (
    <aside className="w-60 shrink-0 bg-bg-surface border-r border-border flex flex-col overflow-hidden animate-slide-in">
      {/* Header */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-border shrink-0">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Pages
        </span>
        {pdfDocument && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-text-tertiary font-mono">
              {pdfDocument.getPageCount()}
            </span>
            {/* Add page dropdown */}
            <div className="relative group">
              <button
                onClick={handleAddPage}
                className="p-1 rounded hover:bg-bg-hover text-text-tertiary hover:text-accent transition-colors"
                title="Add page"
              >
                <Plus size={14} />
              </button>
              {/* Dropdown hint on hover */}
              <div className="hidden group-hover:block absolute right-0 top-full mt-1 bg-bg-elevated border border-border rounded-lg shadow-xl py-1 min-w-[160px] z-50">
                <button
                  onClick={() => {
                    setInsertDialogMode("blank");
                    setInsertDialogOpen(true);
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-bg-hover flex items-center gap-2 text-text-secondary"
                >
                  <Plus size={14} />
                  Insert blank page
                </button>
                <button
                  onClick={() => {
                    setInsertDialogMode("file");
                    setInsertDialogOpen(true);
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-bg-hover flex items-center gap-2 text-text-secondary"
                >
                  <FileUp size={14} />
                  Insert from file
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Page thumbnails */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2">
        {pdfDocument ? (
          <>
            <SortableThumbnails
              pageCount={pdfDocument.getPageCount()}
              getPageDimensions={(i) => {
                const p = pdfDocument.getPages()[i];
                return { width: p.getWidth(), height: p.getHeight() };
              }}
              onReorder={handleReorder}
            />

            {/* Context menu */}
            {contextMenuPageIndex !== null && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={closeContextMenu}
                />
                <div
                  className="fixed z-50 bg-bg-elevated border border-border rounded-lg shadow-xl py-1 min-w-[160px]"
                  style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
                >
                  <button
                    onClick={() => handleDuplicatePage(contextMenuPageIndex)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-bg-hover flex items-center gap-2 text-text-secondary"
                  >
                    <Copy size={14} />
                    Duplicate page
                  </button>
                  <button
                    onClick={() => {
                      setInsertDialogMode("blank");
                      setInsertDialogOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-bg-hover flex items-center gap-2 text-text-secondary"
                  >
                    <Plus size={14} />
                    Insert blank after
                  </button>
                  <button
                    onClick={() => {
                      setInsertDialogMode("file");
                      setInsertDialogOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-bg-hover flex items-center gap-2 text-text-secondary"
                  >
                    <FileUp size={14} />
                    Insert from file
                  </button>
                  {canDelete && (
                    <>
                      <div className="h-px bg-border my-1" />
                      <button
                        onClick={() => handleDeletePage(contextMenuPageIndex)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-bg-hover flex items-center gap-2 text-destructive"
                      >
                        <Trash2 size={14} />
                        Delete page
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-text-tertiary text-sm p-4 text-center">
            <p>No document open.</p>
            <p className="mt-1 text-xs">Drop a PDF or click Open.</p>
          </div>
        )}
      </div>

      {/* Insert page dialog */}
      <InsertPageDialog
        open={insertDialogOpen}
        onClose={() => setInsertDialogOpen(false)}
        mode={insertDialogMode}
        insertAfterIndex={activePageIndex}
      />
    </aside>
  );
}
