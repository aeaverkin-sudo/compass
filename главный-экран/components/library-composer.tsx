"use client";

import { Plus } from "lucide-react";
import { useCallback, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { autoLinkDisplay, canRenameLinkDisplay, customDisplayName } from "@/shared/services/link-display";
import { itemPhotoSrc } from "@/shared/services/card-photo";
import type { ContactItem } from "@/shared/types";
import { useVisualViewport } from "@landing/hooks/use-visual-viewport";
import { openContactAttachmentPicker } from "@landing/components/photo-input-utils";

const ADD_FIELD_FONT_PX = 18.2;
const ADD_FIELD_LINE = 1.35;
const ADD_PLACEHOLDER = "Add link, file, text, contact…";
const TEXTAREA_MAX_PX = 120;
/** Below this the keyboard is closed — sit on the screen edge, not a phantom gap. */
const KEYBOARD_FLOOR_PX = 40;
const BLUR_SETTLE_MS = 120;
/** Masks the seam between the line and the iOS keyboard accessory bar. */
const DOCK_SEAM_FADE_PX = 22;

type LibraryComposerProps = {
  item: ContactItem;
  attachmentError?: string | null;
  onValueChange: (value: string) => void;
  onLabelChange: (label: string) => void;
  /** Return false to keep the field open (the file was rejected). */
  onAttachment: (file: File, dataUrl: string) => boolean;
  onBlur: () => void;
};

/**
 * One writing line, portaled to <body> and pinned to the top of the keyboard.
 * Position comes only from the visual viewport. The page is never scrolled and
 * the line is never frozen in place — both of those detach the caret from the field.
 */
export function LibraryComposer({
  item,
  attachmentError,
  onValueChange,
  onLabelChange,
  onAttachment,
  onBlur,
}: LibraryComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const sheetOpen = useRef(false);
  const blurTimer = useRef<number | null>(null);
  const { keyboardInset } = useVisualViewport();
  const photoSrc = itemPhotoSrc(item);
  const hasPhotoPreview = Boolean(photoSrc);
  const showName = canRenameLinkDisplay(item);
  const dockBottom = keyboardInset < KEYBOARD_FLOOR_PX ? 0 : keyboardInset;

  const placeCaret = useCallback(() => {
    const field = textareaRef.current;
    if (!field) return;
    field.focus({ preventScroll: true });
    const end = field.value.length;
    field.setSelectionRange(end, end);
  }, []);

  const resizeTextarea = useCallback(() => {
    const field = textareaRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, TEXTAREA_MAX_PX)}px`;
  }, []);

  useLayoutEffect(() => {
    resizeTextarea();
    placeCaret();
  }, [item.id, placeCaret, resizeTextarea]);

  useLayoutEffect(() => {
    resizeTextarea();
  }, [item.value, resizeTextarea]);

  const clearBlurTimer = () => {
    if (blurTimer.current === null) return;
    window.clearTimeout(blurTimer.current);
    blurTimer.current = null;
  };

  const handleAttach = () => {
    clearBlurTimer();
    sheetOpen.current = true;
    openContactAttachmentPicker(
      (dataUrl, file) => {
        sheetOpen.current = false;
        const accepted = onAttachment(file, dataUrl);
        if (!accepted) placeCaret();
      },
      () => {
        sheetOpen.current = false;
        placeCaret();
      },
    );
  };

  const handleBlur = () => {
    clearBlurTimer();
    blurTimer.current = window.setTimeout(() => {
      blurTimer.current = null;
      if (sheetOpen.current) return;
      if (rootRef.current?.contains(document.activeElement)) return;
      onBlur();
    }, BLUR_SETTLE_MS);
  };

  const field = (
    <div
      ref={rootRef}
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center bg-white px-[calc(clamp(24px,6.1vw,28px)-3mm)]"
      style={{ bottom: dockBottom }}
    >
      <div className="pointer-events-auto relative w-full">
        {attachmentError ? (
          <p className="mb-2 px-1 text-center text-[12px] leading-snug text-destructive">
            {attachmentError}
          </p>
        ) : null}

        <div className="flex items-start gap-[11px] border-b-[0.5px] border-[#111] py-2">
          {hasPhotoPreview && photoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoSrc} alt="" className="size-10 shrink-0 object-cover" />
          ) : (
            <button
              type="button"
              aria-label="Add photo or file"
              onPointerDown={(event) => event.preventDefault()}
              onClick={handleAttach}
              className="flex w-7 shrink-0 items-center justify-center text-[#111] transition-opacity active:opacity-60"
              style={{ height: ADD_FIELD_FONT_PX * ADD_FIELD_LINE }}
            >
              <Plus className="size-7 text-[#111]" strokeWidth={1} aria-hidden />
            </button>
          )}

          <div className="min-w-0 flex-1">
            <textarea
              ref={textareaRef}
              rows={1}
              value={item.value}
              placeholder={hasPhotoPreview ? item.label || "Photo" : ADD_PLACEHOLDER}
              aria-label="Contact field"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              onChange={(event) => onValueChange(event.target.value)}
              onBlur={handleBlur}
              className="compass-input block w-full resize-none overflow-y-auto bg-transparent p-0 text-[18.2px] leading-[1.35] font-normal tracking-[-0.015em] text-[#111] outline-none placeholder:text-[15.4px] placeholder:font-normal placeholder:tracking-normal placeholder:text-[#999] placeholder:normal-case"
            />
            {showName ? (
              <input
                type="text"
                value={customDisplayName(item) ? item.label : ""}
                placeholder={autoLinkDisplay(item) || "Name"}
                aria-label="Display name"
                autoCorrect="off"
                spellCheck={false}
                onChange={(event) => onLabelChange(event.target.value)}
                onBlur={handleBlur}
                className="compass-input mt-1 block w-full truncate border-t border-hairline/40 bg-transparent pt-1 text-[18.2px] leading-[1.3] text-foreground outline-none placeholder:font-normal placeholder:text-hint"
              />
            ) : null}
          </div>
        </div>

        {dockBottom > 0 ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-full z-10 bg-gradient-to-b from-sheet via-sheet/55 to-transparent"
            style={{ height: DOCK_SEAM_FADE_PX }}
          />
        ) : null}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(field, document.body);
}
