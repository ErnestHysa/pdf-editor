'use client';
import { useState } from 'react';
import type { AnnotationObject as ZustandAnnotation } from '@/stores/documentStore';

interface Props {
  annotation: ZustandAnnotation;
  isEditing: boolean;
  onStickyEdit: (content: string) => void;
  onCommentEdit: (content: string) => void;
  commentInput: string;
  onCommentInputChange: (v: string) => void;
  activeCommentId: string | null;
  onCommentPopoverClose: () => void;
  pageAnnotations: ZustandAnnotation[];
}

export function ZustandAnnotationView({
  annotation,
  isEditing,
  onStickyEdit,
  onCommentEdit,
  commentInput,
  onCommentInputChange,
  activeCommentId,
  onCommentPopoverClose,
  pageAnnotations,
}: Props) {
  const [stickyText, setStickyText] = useState('');

  if (annotation.type === 'highlight') {
    return (
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundColor: annotation.color, opacity: annotation.opacity * 0.35 }}
      />
    );
  }

  if (annotation.type === 'underline') {
    return (
      <div
        className="absolute bottom-0 left-0 right-0 h-0.5 pointer-events-none"
        style={{ backgroundColor: annotation.color }}
      />
    );
  }

  if (annotation.type === 'strikethrough') {
    return (
      <div
        className="absolute top-1/2 left-0 right-0 h-0.5 pointer-events-none -translate-y-1/2"
        style={{ backgroundColor: annotation.color }}
      />
    );
  }

  if (annotation.type === 'sticky') {
    if (isEditing) {
      return (
        <textarea
          className="w-full h-full p-2 rounded text-xs resize-none bg-yellow-50 border-2 border-yellow-400"
          style={{ color: '#92400e' }}
          value={stickyText}
          onChange={(e) => setStickyText(e.target.value)}
          onBlur={() => { onStickyEdit(stickyText); setStickyText(''); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setStickyText(''); onStickyEdit(''); }
          }}
          autoFocus
          placeholder="Add note..."
        />
      );
    }
    return (
      <div
        className="w-full h-full p-2 rounded shadow text-xs overflow-hidden"
        style={{ backgroundColor: annotation.color, color: '#92400e' }}
      >
        {annotation.content || 'Double-click to edit'}
      </div>
    );
  }

  if (annotation.type === 'comment') {
    const commentNumber = pageAnnotations
      .filter((a) => a.type === 'comment')
      .findIndex((a) => a.id === annotation.id) + 1;
    const isActive = activeCommentId === annotation.id;

    return (
      <div className="relative">
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-2xs font-bold shadow-md"
          style={{ backgroundColor: annotation.color }}
        >
          {commentNumber}
        </div>
        {isActive && (
          <div
            className="absolute top-full left-0 mt-1 w-52 bg-bg-elevated rounded-lg shadow-xl border border-border z-50 p-3"
            style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-2xs mb-1" style={{ color: 'var(--text-tertiary)' }}>
              {annotation.author ?? 'You'}
            </div>
            {isEditing ? (
              <>
                <textarea
                  className="w-full text-sm rounded p-1 resize-none"
                  style={{
                    borderColor: 'var(--border)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                  }}
                  value={commentInput}
                  onChange={(e) => onCommentInputChange(e.target.value)}
                  rows={3}
                  autoFocus
                  placeholder="Add comment..."
                />
                <div className="flex gap-1 mt-1">
                  <button
                    className="px-2 py-0.5 text-2xs rounded"
                    style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
                    onClick={() => { onCommentEdit(commentInput); onCommentPopoverClose(); }}
                  >
                    Save
                  </button>
                  <button
                    className="px-2 py-0.5 text-2xs rounded border"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                    onClick={onCommentPopoverClose}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ color: 'var(--text-primary)' }}>{annotation.content || 'No comment'}</div>
                <div className="text-2xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  {annotation.timestamp ? new Date(annotation.timestamp).toLocaleString() : ''}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  if (annotation.type === 'drawing') {
    return (
      <img
        src={annotation.imageData}
        className="absolute inset-0 pointer-events-none"
        style={{ width: annotation.width, height: annotation.height }}
        alt="drawing"
      />
    );
  }

  if (annotation.type === 'rectangle') {
    return (
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          border: `${annotation.strokeWidth ?? 2}px solid ${annotation.color}`,
          backgroundColor: (annotation as any).filled ? annotation.color + '40' : 'transparent',
          opacity: annotation.opacity,
        }}
      />
    );
  }

  if (annotation.type === 'ellipse') {
    return (
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          border: `${annotation.strokeWidth ?? 2}px solid ${annotation.color}`,
          borderRadius: '50%',
          backgroundColor: (annotation as any).filled ? annotation.color + '40' : 'transparent',
          opacity: annotation.opacity,
        }}
      />
    );
  }

  if (annotation.type === 'arrow' || annotation.type === 'line') {
    const isArrow = annotation.type === 'arrow';
    return (
      <svg className="absolute inset-0 pointer-events-none" style={{ overflow: 'visible' }}>
        <defs>
          <marker
            id={`ann-arrow-${annotation.id}`}
            markerWidth="10" markerHeight="7"
            refX="9" refY="3.5" orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill={annotation.color} />
          </marker>
        </defs>
        <line
          x1={annotation.x} y1={annotation.y}
          x2={annotation.x + annotation.width} y2={annotation.y + annotation.height}
          stroke={annotation.color}
          strokeWidth={annotation.strokeWidth ?? 2}
          markerEnd={isArrow ? `url(#ann-arrow-${annotation.id})` : undefined}
        />
      </svg>
    );
  }

  return null;
}