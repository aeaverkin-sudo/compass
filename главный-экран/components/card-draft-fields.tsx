"use client";

import { Plus } from "lucide-react";
import { useRef } from "react";
import { cn } from "@/lib/utils";
import type { Card } from "@/shared/types";
import {
  browseCardHeight,
  CARD_NAME_GAP_PX,
  CARD_PHOTO_RADIUS_PX,
  CARD_PHOTO_SIZE_PX,
  CARD_PHOTO_TOP_PX,
} from "../layout";

type CardDraftFieldsProps = {
  card: Card;
  onUpdate: (data: Partial<Pick<Card, "displayName" | "photo">>) => void;
};

const HIDDEN_INPUT =
  "pointer-events-none fixed left-0 top-0 h-px w-px overflow-hidden opacity-0";

/** Second card draft — smaller and lighter than the primary card name. */
const DRAFT_NAME_SIZE_PX = 17;

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function mountPhotoInput() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.capture = "user";
  input.className = HIDDEN_INPUT;
  document.body.appendChild(input);
  return input;
}

export function CardDraftFields({ card, onUpdate }: CardDraftFieldsProps) {
  const galleryRef = useRef<HTMLInputElement>(null);

  const openGallery = () => {
    galleryRef.current?.click();
  };

  const openSelfie = () => {
    const input = mountPhotoInput();
    let closed = false;

    const close = () => {
      if (closed) return;
      closed = true;
      window.removeEventListener("focus", onDismiss);
      input.remove();
    };

    const onDismiss = () => {
      window.setTimeout(close, 300);
    };

    input.addEventListener(
      "change",
      () => {
        const file = input.files?.[0];
        if (file) {
          void fileToDataUrl(file).then((photo) => onUpdate({ photo }));
        }
        close();
      },
      { once: true },
    );

    window.addEventListener("focus", onDismiss);
    input.click();
  };

  const onGalleryFile = async (file: File | undefined, input: HTMLInputElement) => {
    if (!file) return;
    onUpdate({ photo: await fileToDataUrl(file) });
    input.value = "";
  };

  return (
    <div
      data-card-content
      className="compass-card compass-layer flex w-full flex-col items-center px-5 pb-5"
      style={{ height: browseCardHeight(), paddingTop: CARD_PHOTO_TOP_PX }}
    >
      <button
        type="button"
        data-card-content
        aria-label="Add photo"
        onClick={openSelfie}
        onContextMenu={(event) => {
          event.preventDefault();
          openGallery();
        }}
        className={cn(
          "shrink-0 overflow-hidden border border-hairline bg-background-ready transition-opacity active:opacity-80",
          card.photo ? "p-0" : "flex items-center justify-center",
        )}
        style={{
          width: CARD_PHOTO_SIZE_PX,
          height: CARD_PHOTO_SIZE_PX,
          borderRadius: CARD_PHOTO_RADIUS_PX,
        }}
      >
        {card.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.photo} alt="" className="size-full object-cover" />
        ) : (
          <Plus className="size-7 text-hint" strokeWidth={1.5} aria-hidden />
        )}
      </button>

      <label
        className="w-full text-center"
        style={{ marginTop: CARD_NAME_GAP_PX }}
        data-card-content
      >
        <span className="sr-only">Name or portfolio title</span>
        <input
          type="text"
          data-card-content
          value={card.displayName}
          placeholder="name, portfolio title"
          onChange={(event) => onUpdate({ displayName: event.target.value })}
          className="compass-input w-full bg-transparent px-0 py-0 text-center font-light leading-[1.15] text-foreground outline-none placeholder:text-hint"
          style={{ fontSize: DRAFT_NAME_SIZE_PX }}
        />
      </label>

      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className={HIDDEN_INPUT}
        tabIndex={-1}
        aria-hidden
        onChange={(event) => onGalleryFile(event.target.files?.[0], event.target)}
      />
    </div>
  );
}
