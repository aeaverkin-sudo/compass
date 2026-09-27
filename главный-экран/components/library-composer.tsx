"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
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
const BLUR_GUARD_MS = 300;
/** Masks the seam between the composer pill and the iOS input accessory bar. */
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
 * A single writing line, always docked to the bottom of the viewport and
 * riding the keyboard via `keyboardInset`. The node is portaled to <body> once
 * and never reparented, so focus holds and the keyboard does not drop.
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
  const pickingRef = useRef(false);
  const mountedAt = useRef(0);
  const heldInset = useRef(0);
  const { keyboardInset } = useVisualViewport();
  const photoSrc = itemPhotoSrc(item);
  const hasPhotoPreview = Boolean(photoSrc);
  const showName = canRenameLinkDisplay(item);

  // The native file picker collapses the keyboard. Hold the last docked height
  // so the field stays put instead of dropping to the floor and springing back.
  if (!pickingRef.current && keyboardInset > 0) heldInset.current = keyboardInset;
  const dockBottom = pickingRef.current ? heldInset.current : keyboardInset;

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

  // iOS scrolls the layout viewport to the focused field — pin it back so the
  // docked composer stays in frame instead of sliding away.
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
        const accepted = onAttachment(file, dataUrl);
        if (!accepted) textareaRef.current?.focus({ preventScroll: true });
      },
      () => {
        window.setTimeout(() => {
          pickingRef.current = false;
          textareaRef.current?.focus({ preventScroll: true });
        }, 120);
      },
    );
  };

  const handleBlur = () => {
    window.setTimeout(() => {
      if (Date.now() - mountedAt.current < 450) return;
      if (pickingRef.current) return;
      if (rootRef.current?.contains(document.activeElement)) return;
      onBlur();
    }, BLUR_GUARD_MS);
  };

  const field = (
    <div
      ref={rootRef}
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center bg-white px-[calc(clamp(24px,6.1vw,28px)-3mm)] transition-[bottom] duration-200 ease-out"
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
              onMouseDown={(event) => event.preventDefault()}
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
