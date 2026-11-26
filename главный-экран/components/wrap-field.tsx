"use client";

import { CornerDownLeft } from "lucide-react";
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type FocusEvent, type PointerEvent as ReactPointerEvent, type Ref } from "react";
import { flushSync } from "react-dom";
import { cn } from "@/lib/utils";
import { MarkPlus, plusInkInsetPx } from "@/shared/components/mark-plus";
import { useKeyboardVisible } from "../hooks/use-keyboard-dock";

/** Hint plus. Same box as the toolbar plus, in ink. Out of flow, so the hint line stays its height. */
const HINT_PLUS_PX = 23;
const HINT_PLUS_GAP_PX = 6;

export type WrapFieldHandle = {
  focusEnd: () => void;
  text: () => string;
  clear: () => void;
  element: () => HTMLDivElement | null;
};

/** One-line rows: a pasted line break becomes a space. */
function flatten(value: string) {
  return value.replace(/\s*\n\s*/g, " ");
}

/** One block. Edge spaces and blank lines go; the breaks inside stay, including empty lines. */
function keepBreaks(value: string) {
  return value.trim();
}

function placeRange(selection: Selection, range: Range) {
  selection.removeAllRanges();
  selection.addRange(range);
}

function insertLineBreak(editor: HTMLDivElement, saved: Range | null) {
  const selection = window.getSelection();
  editor.focus({ preventScroll: true });
  if (!selection) return;
  if (saved) {
    placeRange(selection, saved);
  } else {
    const end = document.createRange();
    end.selectNodeContents(editor);
    end.collapse(false);
    placeRange(selection, end);
  }
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode("\n");
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
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
  grow = true,
  className,
  placeholderClassName,
  wrapPlaceholder = false,
  placeholderMark = false,
  multiline = false,
  breakButton = true,
  onTextChange,
  onDone,
  onEmptyDelete,
  onFocus,
  onBlur,
  onPointerDown,
}: {
  ref?: Ref<WrapFieldHandle>;
  initial?: string;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  /** Stretch to the row. The heading pill turns this off so the sky chip hugs Title…. */
  grow?: boolean;
  /** Additional / about text. Enter inserts a line. Other rows stay one paragraph. */
  multiline?: boolean;
  /** The composer sends from the keyboard check, so it hides the in-row return glyph. */
  breakButton?: boolean;
  className?: string;
  placeholderClassName?: string;
  /** An empty-section hint may take a second line. Other placeholders stay one line. */
  wrapPlaceholder?: boolean;
  /** Black plus before a wrapping hint. The second line lines up with the text, not the plus. */
  placeholderMark?: boolean;
  onTextChange?: (text: string) => void;
  onDone: (text: string) => void;
  /** Backspace on an empty field. New-zone Title… and an empty add line use this. */
  onEmptyDelete?: () => void;
  onFocus?: () => void;
  onBlur?: (text: string, event: FocusEvent<HTMLDivElement>) => void;
  onPointerDown?: () => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<Range | null>(null);
  const openedAs = useRef(initial);
  const [empty, setEmpty] = useState(!initial.trim());
  const [focused, setFocused] = useState(autoFocus);
  const wrapHint = wrapPlaceholder && empty && Boolean(placeholder);
  const hintInset = plusInkInsetPx(HINT_PLUS_PX);

  const rememberCaret = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;
    if (!editor.contains(selection.anchorNode)) return;
    caretRef.current = selection.getRangeAt(0).cloneRange();
  };

  const read = useCallback(() => {
    const raw = editorRef.current?.textContent ?? "";
    return multiline ? keepBreaks(raw) : flatten(raw);
  }, [multiline]);

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

  const onDoneRef = useRef(onDone);
  const keyboardUp = useKeyboardVisible();
  const keyboardWasUp = useRef(false);
  useEffect(() => {
    onDoneRef.current = onDone;
    const editor = editorRef.current;
    const focused = !!editor && document.activeElement === editor;
    if (keyboardWasUp.current && !keyboardUp && focused) {
      keyboardWasUp.current = false;
      onDoneRef.current(read());
      editor.blur();
      return;
    }
    keyboardWasUp.current = keyboardUp;
  }, [keyboardUp, onDone, read]);

  const breakLine = () => {
    const editor = editorRef.current;
    if (!editor) return;
    insertLineBreak(editor, caretRef.current);
    rememberCaret();
    const text = read();
    setEmpty(!text);
    onTextChange?.(text);
  };

  return (
    <div className={cn("flex min-w-0 items-end gap-2", grow ? "flex-1" : "w-auto")}>
      <div className={cn("relative min-w-0", grow && "flex-1")}>
        {empty && placeholder ? (
          placeholderMark && wrapHint ? (
            <span
              aria-hidden
              className={cn(
                "pointer-events-none relative block whitespace-normal break-words",
                focused && "invisible",
                placeholderClassName,
              )}
            >
              <span
                className="absolute top-0 left-0 flex h-[1lh] items-center text-[var(--ink)]"
                style={{ transform: `translateX(${-hintInset}px)` }}
              >
                <MarkPlus size={HINT_PLUS_PX} />
              </span>
              <span className="block break-words" style={{ paddingLeft: HINT_PLUS_PX + HINT_PLUS_GAP_PX - hintInset }}>
                {placeholder}
              </span>
            </span>
          ) : (
            <span
              aria-hidden
              className={cn(
                "pointer-events-none",
                wrapHint ? "block whitespace-normal break-words" : "absolute inset-x-0 top-0 truncate",
                placeholderClassName,
              )}
            >
              {placeholder}
            </span>
          )
        ) : null}
        <div
          ref={editorRef}
          role="textbox"
          aria-label={label}
          aria-multiline={multiline}
          contentEditable="plaintext-only"
          suppressContentEditableWarning
          enterKeyHint={multiline ? "enter" : "done"}
          autoCorrect="off"
          autoCapitalize="sentences"
          spellCheck={false}
          data-no-swipe
          onInput={() => {
            rememberCaret();
            const text = read();
            setEmpty(!text);
            onTextChange?.(text);
          }}
          onKeyUp={rememberCaret}
          onMouseUp={rememberCaret}
          onKeyDown={(event) => {
            if (onEmptyDelete && (event.key === "Backspace" || event.key === "Delete") && !read()) {
              event.preventDefault();
              onEmptyDelete();
              return;
            }
            if (event.key !== "Enter" || multiline) return;
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            event.preventDefault();
            onDone(read());
          }}
          onFocus={() => {
            setFocused(true);
            onFocus?.();
          }}
          onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
            onPointerDown?.();
            // iOS only opens the keyboard when focus happens in the tap itself.
            // Hide the hint first, then place the caret, still inside this handler.
            if (!placeholderMark || !wrapHint || focused) return;
            if (event.button !== 0) return;
            flushSync(() => setFocused(true));
            focusEnd();
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(read(), event);
          }}
          className={cn(
            "compass-input min-w-0 break-words [overflow-wrap:anywhere] text-[#111] caret-[#111] outline-none select-text",
            "whitespace-pre-wrap",
            wrapHint && "absolute inset-0",
            className,
          )}
        >
          {openedAs.current}
        </div>
      </div>
      {multiline && breakButton ? (
        <button
          type="button"
          aria-label="New line"
          data-no-swipe
          onPointerDown={(event) => event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}
          onPointerUp={(event) => {
            if (event.pointerType === "mouse" && event.button !== 0) return;
            breakLine();
          }}
          className="mb-0.5 flex size-7 shrink-0 items-center justify-center text-[var(--ink)]"
        >
          <CornerDownLeft className="size-5" strokeWidth={1.5} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
