"use client";

import { File as FileIcon, Plus } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { itemPhotoSrc } from "@/shared/services/card-photo";
import { publicCardUrl } from "@/shared/services/public-card-url";
import { isCardReady } from "@/shared/store/app-store";
import type { Card, ContactItem } from "@/shared/types";
import { useMainLayout } from "@main/hooks/use-main-layout";
import { QrZone } from "./qr-zone";

const ADD_PLACEHOLDER = "Add link, file, text, contact…";
/** The add line grows upward to this height, then scrolls inside. */
const FIELD_MAX_PX = 120;
const CARD_PAD = "px-[calc(clamp(24px,6.1vw,28px)-3mm)]";

type AddOverlayProps = {
  card: Card;
  /** The card's own photo and name block. */
  header: ReactNode;
  text: string;
  error: string | null;
  fileItem?: ContactItem;
  onText: (value: string) => void;
  onFocus: () => void;
  /** Opens the current file picker. The plate replaces this in the next step. */
  onAttach: () => void;
  onCommit: () => void;
};

function useVisibleBox() {
  const [box, setBox] = useState(() => {
    if (typeof window === "undefined") return { top: 0, height: 0 };
    const viewport = window.visualViewport;
    return {
      top: viewport?.offsetTop ?? 0,
      height: viewport?.height ?? window.innerHeight,
    };
  });

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const sync = () => setBox({ top: viewport.offsetTop, height: viewport.height });
    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
    };
  }, []);

  return box;
}

/**
 * The writing screen. It tracks the visual viewport, so the line sits on the keyboard
 * without scrolling the page or padding by a remembered keyboard height.
 */
export function AddOverlay({
  card,
  header,
  text,
  error,
  fileItem,
  onText,
  onFocus,
  onAttach,
  onCommit,
}: AddOverlayProps) {
  const layout = useMainLayout();
  const box = useVisibleBox();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const filePhoto = fileItem ? itemPhotoSrc(fileItem) : null;
  const shift = box.top;

  useLayoutEffect(() => {
    fieldRef.current?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, FIELD_MAX_PX)}px`;
  }, [text]);

  return createPortal(
    <div
      data-no-swipe
      data-add-overlay
      className="fixed z-50 flex min-h-0 flex-col overflow-hidden bg-white"
      style={{ top: box.top, height: box.height, left: 0, right: 0 }}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="relative shrink-0" style={{ height: Math.max(0, (layout?.cardTopBrowse ?? 0) - shift) }}>
          {layout ? (
            <QrZone
              url={card.publicToken ? publicCardUrl(card.publicToken) : ""}
              visible={isCardReady(card)}
              topOffsetPx={layout.qrTop - shift}
            />
          ) : null}
        </div>
        <div className={cn("shrink-0", CARD_PAD)}>{header}</div>
        <button type="button" aria-label="Close" className="min-h-0 flex-1" onClick={onCommit} />
      </div>
      <div className={cn("shrink-0", CARD_PAD)}>
        {error ? <p className="pt-2 text-[12px] leading-snug text-destructive">{error}</p> : null}
        <div className="flex items-start gap-[11px] border-b-[0.5px] border-[#111] py-2">
          {filePhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={filePhoto} alt="" className="size-10 shrink-0 object-cover" />
          ) : fileItem ? (
            <FileIcon className="size-7 shrink-0 text-[#111]" strokeWidth={1} aria-hidden />
          ) : (
            <button
              type="button"
              data-no-swipe
              aria-label="Add photo or file"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onAttach}
              className="flex h-[24.6px] w-7 shrink-0 items-center justify-center text-[#111]"
            >
              <Plus className="size-7 text-[#111]" strokeWidth={1} aria-hidden />
            </button>
          )}
          <textarea
            ref={fieldRef}
            rows={1}
            value={text}
            placeholder={fileItem ? fileItem.value : ADD_PLACEHOLDER}
            aria-label={ADD_PLACEHOLDER}
            enterKeyHint="done"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-no-swipe
            onChange={(event) => onText(event.target.value.replace(/\s*\n\s*/g, " "))}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              onCommit();
            }}
            onFocus={onFocus}
            className="compass-input block min-w-0 flex-1 resize-none overflow-y-auto bg-transparent text-[18.2px] leading-[1.35] font-normal tracking-[-0.015em] text-[#111] caret-[#111] outline-none placeholder:text-[15.4px] placeholder:font-normal placeholder:text-[#999]"
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
