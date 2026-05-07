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

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.select();
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
      }}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    />
  );
}
