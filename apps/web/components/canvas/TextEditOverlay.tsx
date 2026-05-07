'use client';
import { useRef, useEffect, useState } from 'react';
import { TextObject } from '@pagecraft/pdf-engine';
import { cn } from '@/lib/utils';

interface TextEditOverlayProps {
  textObject: TextObject;
  onClose: () => void;
  onSave: (newContent: string) => void;
}

export function TextEditOverlay({ textObject, onClose, onSave }: TextEditOverlayProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(textObject.getContent());
  const style = textObject.getStyle();
  const bbox = textObject.getBBox();

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
        width: bbox.width,
        minHeight: bbox.height,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        fontStyle: style.fontStyle,
        color: style.color,
        textAlign: style.textAlign,
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
