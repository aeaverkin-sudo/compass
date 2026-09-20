"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  EMPTY_CONTACT_PLACEHOLDER,
  rowTypeLabel,
} from "@/shared/services/contact-item";
import type { ContactItem } from "@/shared/types";
import { useVisualViewport } from "@landing/hooks/use-visual-viewport";
import { PhotoSourceMenu, type PhotoSource } from "@landing/components/photo-source-menu";
import {
  openDocumentPicker,
  openGalleryPicker,
  openSelfiePicker,
} from "@landing/components/photo-input-utils";

const FILL_ICON_STROKE = 1;
const TEXTAREA_MAX_PX = 120;

type LibraryComposerProps = {
  item: ContactItem;
  attachmentError?: string | null;
  onValueChange: (value: string) => void;
  onAttachment: (file: File, dataUrl: string) => void;
  onBlur: () => void;
};

export function LibraryComposer({
  item,
  attachmentError,
  onValueChange,
  onAttachment,
  onBlur,
}: LibraryComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pickingRef = useRef(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const { keyboardInset } = useVisualViewport();
  const label = rowTypeLabel(item);

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
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, [item.id]);

  useEffect(() => {
    if (!attachOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setAttachOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [attachOpen]);

  const handleAttachPick = (source: PhotoSource) => {
    pickingRef.current = true;

    const onPick = (dataUrl: string, file: File) => {
      pickingRef.current = false;
      onAttachment(file, dataUrl);
      setAttachOpen(false);
      textareaRef.current?.focus();
    };
    const onDismiss = () => {
      pickingRef.current = false;
      setAttachOpen(false);
      textareaRef.current?.focus();
    };

    if (source === "selfie") {
      openSelfiePicker(onPick, onDismiss);
      return;
    }
    if (source === "gallery") {
      openGalleryPicker(onPick, onDismiss);
      return;
    }
    openDocumentPicker(onPick, onDismiss);
  };

  const handleBlur = () => {
    window.setTimeout(() => {
      if (pickingRef.current) return;
      if (rootRef.current?.contains(document.activeElement)) return;
      onBlur();
    }, 120);
  };

  return (
    <div
      ref={rootRef}
      className="fixed inset-x-0 z-40 px-3"
      style={{
        bottom:
          keyboardInset > 0 ? keyboardInset : "max(0.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="mx-auto w-full max-w-[360px]">
        {attachmentError ? (
          <p className="mb-2 px-1 text-center text-[12px] leading-snug text-destructive">
            {attachmentError}
          </p>
        ) : null}
        {attachOpen ? (
          <div className="mb-2 flex justify-start pl-1">
            <PhotoSourceMenu
              onPick={handleAttachPick}
              iconClassName="size-5 text-hairline"
              gapClassName="gap-4"
            />
          </div>
        ) : null}

        <div className="flex items-end gap-2 rounded-[22px] border border-hairline/30 bg-[oklch(98%_0.004_70)] px-3 py-2 shadow-[0_2px_12px_oklch(0%_0_0/0.06)]">
          <button
            type="button"
            aria-label="Add photo or file"
            aria-expanded={attachOpen}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setAttachOpen((open) => !open)}
            className="mb-0.5 flex size-8 shrink-0 items-center justify-center transition-opacity active:opacity-60"
          >
            <Plus className="size-5 text-hairline" strokeWidth={FILL_ICON_STROKE} aria-hidden />
          </button>

          <div className="min-w-0 flex-1">
            {label ? (
              <span className="mb-1 block truncate text-[11px] leading-none text-hint">{label}</span>
            ) : null}
            <textarea
              ref={textareaRef}
              rows={1}
              value={item.value}
              placeholder={EMPTY_CONTACT_PLACEHOLDER}
              aria-label={label ?? "Contact field"}
              onChange={(event) => onValueChange(event.target.value)}
              onBlur={handleBlur}
              className={cn(
                "compass-input block w-full resize-none overflow-y-auto bg-transparent text-[15px] leading-[1.35] text-foreground outline-none",
                "placeholder:font-normal placeholder:text-hint",
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
