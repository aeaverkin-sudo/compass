"use client";

import type { Card } from "@/shared/types";
import { PhotoSlotPicker } from "@landing/components/photo-slot-picker";
import {
  browseCardHeight,
  CARD_NAME_GAP_PX,
  CARD_NAME_SIZE_PX,
  CARD_PHOTO_RADIUS_PX,
  CARD_PHOTO_SIZE_PX,
  CARD_PHOTO_TOP_PX,
} from "../layout";

type CardDraftFieldsProps = {
  card: Card;
  onUpdate: (data: Partial<Pick<Card, "displayName" | "photo">>) => void;
};

export function CardDraftFields({ card, onUpdate }: CardDraftFieldsProps) {
  return (
    <div
      data-card-content
      className="compass-card compass-layer relative flex w-full flex-col items-center px-5 pb-5"
      style={{ height: browseCardHeight(), paddingTop: CARD_PHOTO_TOP_PX }}
    >
      <PhotoSlotPicker
        photo={card.photo ?? null}
        onPhotoChange={(photo) => onUpdate({ photo: photo ?? undefined })}
        sizePx={CARD_PHOTO_SIZE_PX}
        borderRadiusPx={CARD_PHOTO_RADIUS_PX}
      />

      <label
        className="w-full text-center"
        style={{ marginTop: CARD_NAME_GAP_PX }}
        data-card-content
      >
        <span className="sr-only">Name or portfolio title</span>
        <input
          type="text"
          name="displayName"
          data-card-content
          value={card.displayName}
          placeholder="name, portfolio title"
          autoComplete="name"
          autoCapitalize="words"
          onChange={(event) => onUpdate({ displayName: event.target.value })}
          onInput={(event) => onUpdate({ displayName: event.currentTarget.value })}
          className="compass-input w-full bg-transparent px-0 py-0 text-center font-light leading-[1.15] text-foreground outline-none placeholder:text-hint"
          style={{ fontSize: CARD_NAME_SIZE_PX }}
        />
      </label>
    </div>
  );
}
