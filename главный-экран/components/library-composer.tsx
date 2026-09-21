"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { EMPTY_CONTACT_PLACEHOLDER } from "@/shared/services/contact-item";
import type { ContactItem } from "@/shared/types";
import { useVisualViewport } from "@landing/hooks/use-visual-viewport";
import { openContactAttachmentPicker } from "@landing/components/photo-input-utils";

const FILL_ICON_STROKE = 1;
const TEXTAREA_MAX_PX = 120;
const KEYBOARD_DOCK_PADDING_PX = 8;
/** iOS form navigation bar above the keyboard — not always included in visualViewport height. */
const IOS_INPUT_ACCESSORY_BAR_PX = 44;

type LibraryComposerProps = {
  item: ContactItem;
  contentWidthPx?: number;
  attachmentError?: string | null;
  onValueChange: (value: string) => void;
  onAttachment: (file: File, dataUrl: string) => void;
  onBlur: () => void;
};

export function LibraryComposer({
  item,
  contentWidthPx,
  attachmentError,
  onValueChange,
  onAttachment,
  onBlur,
}: LibraryComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pickingRef = useRef(false);
  const mountedAt = useRef(0);
  const { offsetTop, height: viewportHeight, keyboardOpen } = useVisualViewport();
  const dockedAboveKeyboard = keyboardOpen;

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_PX)}px`;
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [item.value, resizeTextarea]);

  useEffect(() => {
    mountedAt.current = Date.now();
    textareaRef.current?.focus({ preventScroll: true });
  }, [item.id]);

  // iOS scrolls the visual viewport to the focused field — pin the page back
  // so the composer stays in the visible frame instead of flying off-screen.
  useEffect(() => {
    const lock = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    lock();
    window.addEventListener("scroll", lock, { passive: true });
    window.visualViewport?.addEventListener("scroll", lock);

    return () => {
      window.removeEventListener("scroll", lock);
      window.visualViewport?.removeEventListener("scroll", lock);
      lock();
    };
  }, []);

  const handleAttach = () => {
    pickingRef.current = true;

    openContactAttachmentPicker(
      (dataUrl, file) => {
        pickingRef.current = false;
        onAttachment(file, dataUrl);
        textareaRef.current?.focus();
      },
      () => {
        pickingRef.current = false;
        textareaRef.current?.focus();
      },
    );
  };

  const handleBlur = () => {
    window.setTimeout(() => {
      if (Date.now() - mountedAt.current < 450) return;
      if (pickingRef.current) return;
      if (textareaRef.current && document.activeElement === textareaRef.current) return;
      if (rootRef.current?.contains(document.activeElement)) return;
      onBlur();
    }, 180);
  };

  const pillWidthStyle = contentWidthPx ? { width: contentWidthPx, maxWidth: "100%" } : undefined;

  return (
    <div
      ref={rootRef}
      className={cn(
        "w-full",
        dockedAboveKeyboard
          ? "pointer-events-none fixed inset-x-0 z-40 flex items-end justify-center"
          : "relative z-10 shrink-0",
      )}
      style={
        dockedAboveKeyboard
          ? {
              top: offsetTop,
              height: viewportHeight > 0 ? viewportHeight : "100%",
              paddingBottom: KEYBOARD_DOCK_PADDING_PX + IOS_INPUT_ACCESSORY_BAR_PX,
            }
          : undefined
      }
    >
      <div
        className={cn("w-full", dockedAboveKeyboard && "pointer-events-auto shrink-0")}
        style={pillWidthStyle}
      >
      {attachmentError ? (
        <p className="mb-2 px-1 text-center text-[12px] leading-snug text-destructive">
          {attachmentError}
        </p>
      ) : null}

      <div className="compass-block flex items-center gap-2 rounded-[22px] px-3 py-2">
        <button
          type="button"
          aria-label="Add photo or file"
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleAttach}
          className="flex size-8 shrink-0 items-center justify-center transition-opacity active:opacity-60"
        >
          <Plus className="size-5 text-hairline" strokeWidth={FILL_ICON_STROKE} aria-hidden />
        </button>

        <div className="min-w-0 flex-1">
          <textarea
            ref={textareaRef}
            rows={1}
            value={item.value}
            placeholder={EMPTY_CONTACT_PLACEHOLDER}
            aria-label="Contact field"
            onChange={(event) => onValueChange(event.target.value)}
            onBlur={handleBlur}
            className={cn(
              "compass-input block w-full resize-none overflow-y-auto bg-transparent text-[16px] leading-[1.35] text-foreground outline-none",
              "placeholder:font-normal placeholder:text-hint",
            )}
          />
        </div>
      </div>
      </div>
    </div>
  );
}
