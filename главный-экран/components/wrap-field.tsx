"use client";

import { useCallback, useImperativeHandle, useLayoutEffect, useRef, useState, type FocusEvent, type Ref } from "react";
import { cn } from "@/lib/utils";

export type WrapFieldHandle = {
  focusEnd: () => void;
  text: () => string;
  clear: () => void;
  element: () => HTMLDivElement | null;
};

/** Rows are one paragraph: a pasted line break becomes a space. */
function flatten(value: string) {
  return value.replace(/\s*\n\s*/g, " ");
}

/**
 * The in-place editor of an existing card row: a single paragraph that wraps by words.
 * Uncontrolled on purpose — React never rewrites the text while the caret is inside.
 */
export function WrapField({
  ref,
  initial = "",
  label,
  placeholder,
  autoFocus = false,
  className,
  placeholderClassName,
  onTextChange,
  onDone,
  onFocus,
  onBlur,
}: {
  ref?: Ref<WrapFieldHandle>;
  initial?: string;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  placeholderClassName?: string;
  onTextChange?: (text: string) => void;
  onDone: (text: string) => void;
  onFocus?: () => void;
  onBlur?: (text: string, event: FocusEvent<HTMLDivElement>) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(!initial);

  const read = useCallback(() => flatten(editorRef.current?.textContent ?? ""), []);

  const focusEnd = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      focusEnd,
      text: read,
      clear: () => {
        if (editorRef.current) editorRef.current.textContent = "";
        setEmpty(true);
      },
      element: () => editorRef.current,
    }),
    [focusEnd, read],
  );

  // Layout phase: when mounted from a tap, focus still counts as user-initiated on iOS.
  useLayoutEffect(() => {
    if (autoFocus) focusEnd();
  }, [autoFocus, focusEnd]);

  return (
    <div className="relative min-w-0 flex-1">
      {empty && placeholder ? (
        <span aria-hidden className={cn("pointer-events-none absolute inset-x-0 top-0 truncate", placeholderClassName)}>
          {placeholder}
        </span>
      ) : null}
      <div
        ref={editorRef}
        role="textbox"
        aria-label={label}
        aria-multiline
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        enterKeyHint="done"
        autoCorrect="off"
        autoCapitalize="sentences"
        spellCheck={false}
        data-no-swipe
        onInput={() => {
          const text = read();
          setEmpty(!text);
          onTextChange?.(text);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          onDone(read());
        }}
        onFocus={onFocus}
        onBlur={(event) => onBlur?.(read(), event)}
        className={cn(
          "compass-input min-w-0 break-words whitespace-pre-wrap text-[#111] caret-[#111] outline-none select-text",
          className,
        )}
      >
        {initial}
      </div>
    </div>
  );
}
