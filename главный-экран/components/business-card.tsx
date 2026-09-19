"use client";

import { forwardRef, type MouseEvent } from "react";
import { cn } from "@/lib/utils";
import type { Card, ContactItem } from "@/shared/types";
import { PhotoSlotPicker } from "@landing/components/photo-slot-picker";
import { getCardItems } from "@/shared/services/card-snapshot";
import {
  browseCardHeight,
  CARD_PHOTO_RADIUS_PX,
  CARD_PHOTO_SIZE_PX,
  CARD_PHOTO_TOP_PX,
  CARD_NAME_GAP_PX,
  CARD_NAME_SIZE_PX,
  LIBRARY_PHOTO_RADIUS_PX,
  LIBRARY_PHOTO_SIZE_PX,
  type MainScreenMode,
} from "../layout";

type BusinessCardProps = {
  card: Card;
  library: ContactItem[];
  mode: MainScreenMode;
  libraryCardHeightPx?: number;
  onEmptyAreaTap: () => void;
  onPhotoChange?: (photo: string | null) => void;
};

function ContactChip({ item, compact }: { item: ContactItem; compact: boolean }) {
  return (
    <span
      data-card-content
      className={cn(
        "inline-flex max-w-full items-center rounded-[10px] bg-[oklch(94%_0.008_70)] text-foreground",
        compact
          ? "h-[25px] px-2 text-[11px] leading-none"
          : "h-16 px-5 text-[26px] leading-none",
      )}
    >
      <span className="truncate">{item.value}</span>
    </span>
  );
}

export const BusinessCard = forwardRef<HTMLElement, BusinessCardProps>(function BusinessCard(
  { card, library, mode, libraryCardHeightPx, onEmptyAreaTap, onPhotoChange },
  ref,
) {
  const items = getCardItems(card, library);
  const compact = mode === "library";

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("[data-card-content]")) return;
    onEmptyAreaTap();
  };

  return (
    <article
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={compact ? "Back to card" : "Business card"}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEmptyAreaTap();
        }
      }}
      className={cn(
        "compass-card compass-layer flex w-full cursor-default flex-col transition-[transform,box-shadow,height] duration-[460ms] ease-out",
        compact
          ? "compass-card-library items-center justify-start px-5 pb-3"
          : "min-h-0 overflow-hidden px-5 pb-5",
      )}
      style={
        compact
          ? {
              height: libraryCardHeightPx,
              paddingTop: CARD_PHOTO_TOP_PX,
            }
          : {
              height: browseCardHeight(),
              paddingTop: CARD_PHOTO_TOP_PX,
            }
      }
    >
      <div className={cn("flex flex-col items-center", !compact && "w-full shrink-0")}>
        {!compact && onPhotoChange ? (
          <PhotoSlotPicker
            photo={card.photo ?? null}
            onPhotoChange={onPhotoChange}
            sizePx={CARD_PHOTO_SIZE_PX}
            borderRadiusPx={CARD_PHOTO_RADIUS_PX}
          />
        ) : card.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            data-card-content
            src={card.photo}
            alt=""
            className={cn("shrink-0 border border-hairline object-cover", !compact && "rounded-[13px]")}
            style={
              compact
                ? {
                    width: LIBRARY_PHOTO_SIZE_PX,
                    height: LIBRARY_PHOTO_SIZE_PX,
                    borderRadius: LIBRARY_PHOTO_RADIUS_PX,
                  }
                : { width: CARD_PHOTO_SIZE_PX, height: CARD_PHOTO_SIZE_PX, borderRadius: CARD_PHOTO_RADIUS_PX }
            }
          />
        ) : null}

        <div className="w-full text-center" style={{ marginTop: CARD_NAME_GAP_PX }}>
          <p
            data-card-content
            className="font-normal leading-[1.12] text-foreground"
            style={{ fontSize: CARD_NAME_SIZE_PX }}
          >
            {card.displayName}
          </p>
          {!compact && card.title ? (
            <p data-card-content className="mt-3 text-[30px] leading-[1.2] text-hint">
              {card.title}
            </p>
          ) : null}
        </div>

        {!compact && items.length > 0 ? (
          <div className="mt-8 flex w-full flex-wrap justify-center gap-3">
            {items.map((item) => (
              <ContactChip key={item.id} item={item} compact={false} />
            ))}
          </div>
        ) : null}
      </div>

    </article>
  );
});
