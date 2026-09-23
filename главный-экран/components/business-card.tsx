"use client";

import { forwardRef, useCallback, useRef, type MouseEvent } from "react";
import { cn } from "@/lib/utils";
import type { Card, ContactItem } from "@/shared/types";
import { useAppStore } from "@/shared/store/app-store";
import { PhotoSlotPicker } from "@landing/components/photo-slot-picker";
import { CardNameField } from "./card-name-field";
import { getCardItems, getNextScanAddons } from "@/shared/services/card-snapshot";
import { composeCard } from "@/shared/services/card-zones";
import { ContactItemChipList } from "./contact-item-chip";
import { NextScanMenu } from "./next-scan-menu";
import {
  browseCardHeight,
  CARD_PHOTO_RADIUS_PX,
  CARD_PHOTO_SIZE_PX,
  CARD_PHOTO_TOP_PX,
  CARD_NAME_GAP_PX,
  CARD_HEADER_NAME_SIZE_PX,
  type MainScreenMode,
} from "../layout";

type BusinessCardProps = {
  card: Card;
  library: ContactItem[];
  mode: MainScreenMode;
  libraryCardHeightPx?: number;
  onEmptyAreaTap: () => void;
  onPhotoChange?: (photo: string | null) => void;
  onDisplayNameChange?: (displayName: string) => void;
  onCardUpdate?: (data: Partial<Card>) => void;
};

export const BusinessCard = forwardRef<HTMLElement, BusinessCardProps>(function BusinessCard(
  {
    card,
    library,
    mode,
    libraryCardHeightPx,
    onEmptyAreaTap,
    onPhotoChange,
    onDisplayNameChange,
    onCardUpdate,
  },
  ref,
) {
  const setCardItemOrder = useAppStore((state) => state.setCardItemOrder);
  const items = getCardItems(card, library);
  const position = composeCard(items).position;
  const compact = mode === "library";
  const nextScanAddons = getNextScanAddons(card);
  const articleRef = useRef<HTMLElement | null>(null);

  const handleCommitOrder = useCallback(
    (orderedIds: string[]) => {
      setCardItemOrder(card.id, orderedIds);
    },
    [card.id, setCardItemOrder],
  );

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("[data-card-content]")) return;
    onEmptyAreaTap();
  };

  return (
    <article
      ref={(node) => {
        articleRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      onClick={handleClick}
      className={cn(
        "compass-card compass-layer flex w-full cursor-default flex-col transition-[transform,box-shadow,height] duration-[460ms] ease-out",
        compact
          ? "compass-card-library min-h-0 items-center justify-start px-5 pb-3"
          : "relative min-h-0 overflow-hidden px-5 pb-5",
      )}
      style={
        compact
          ? {
              height: libraryCardHeightPx,
              paddingTop: 16,
            }
          : {
              height: browseCardHeight(),
              paddingTop: CARD_PHOTO_TOP_PX,
            }
      }
    >
      {!compact && onCardUpdate && card.displayName.trim() && card.photo ? (
        <NextScanMenu
          addons={nextScanAddons}
          onSetAddons={(addons) => onCardUpdate({ nextScanAddons: addons })}
        />
      ) : null}

      <div className="flex w-full shrink-0 flex-col items-center">
        {!compact && onPhotoChange ? (
          <PhotoSlotPicker
            photo={card.photo ?? null}
            onPhotoChange={onPhotoChange}
            sizePx={CARD_PHOTO_SIZE_PX}
            borderRadiusPx={CARD_PHOTO_RADIUS_PX}
          />
        ) : !compact && card.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            data-card-content
            src={card.photo}
            alt=""
            className="shrink-0 border border-[rgba(20,20,20,0.55)] object-cover"
            style={{ width: CARD_PHOTO_SIZE_PX, height: CARD_PHOTO_SIZE_PX, borderRadius: CARD_PHOTO_RADIUS_PX }}
          />
        ) : null}

        <div
          className="w-full text-center"
          style={{ marginTop: !compact && (card.photo || onPhotoChange) ? CARD_NAME_GAP_PX : 0 }}
        >
          {onDisplayNameChange ? (
            <CardNameField
              value={card.displayName}
              onChange={onDisplayNameChange}
              fontSizePx={CARD_HEADER_NAME_SIZE_PX}
              className="font-semibold"
            />
          ) : (
            <p
              data-card-content
              className="font-semibold leading-[1.15] text-foreground"
              style={{ fontSize: CARD_HEADER_NAME_SIZE_PX }}
            >
              {card.displayName}
            </p>
          )}
          {position ? (
            <p
              data-card-content
              className="mt-1 text-center text-[14.5px] font-semibold leading-snug text-foreground"
            >
              {position.title}
              {position.company ? <span className="font-normal text-label"> · {position.company}</span> : null}
            </p>
          ) : null}
        </div>
      </div>

      <ContactItemChipList
        items={items}
        size={compact ? "compact" : "browse"}
        className="pb-2"
        listId={card.id}
        onReorder={compact ? handleCommitOrder : undefined}
      />

    </article>
  );
});
