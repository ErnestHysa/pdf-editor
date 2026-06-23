"use client";
import { useRef, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { SerializableTextObject } from '@/stores/documentStore';

interface TextEditOverlayProps {
  textObject: SerializableTextObject;
  onClose: () => void;
  onSave: (newContent: string) => void;
}

export function TextEditOverlay({ textObject, onClose, onSave }: TextEditOverlayProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(textObject.content);
  const hasFocusedRef = useRef(false);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    // Defer focus to next tick so React finishes rendering before
    // the focus/blur cycle can fire onBlur -> onSave -> unmount
    const timer = setTimeout(() => {
      hasFocusedRef.current = true;
      el.focus();
      el.select();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSave(value);
    }
  };

  const handleBlur = () => {
    // Ignore blur events during initial mount — the textarea
    // may briefly lose focus before the deferred focus() runs
    if (!hasFocusedRef.current) return;
    onSave(value);
  };

  return (
    <textarea
      ref={textareaRef}
      className={cn(
        'text-edit-overlay resize-none overflow-hidden border-b outline-none',
      )}
      style={{
        width: textObject.width,
        minHeight: textObject.height,
        fontFamily: textObject.fontFamily,
        fontSize: textObject.fontSize,
        fontWeight: textObject.fontWeight,
        fontStyle: textObject.fontStyle,
        color: textObject.color,
        textAlign: textObject.textAlign,
        lineHeight: 1.4,
        borderBottomColor: 'var(--accent)',
        backgroundColor: '#ffffff',
      }}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    />
  );
}
