"use client";

import { forwardRef, useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { cn } from "@/lib/utils";
import type { Card, ContactItem } from "@/shared/types";
import { useAppStore } from "@/shared/store/app-store";
import { PhotoSlotPicker } from "@landing/components/photo-slot-picker";
import { CardNameField } from "./card-name-field";
import { getCardItems, getNextScanAddons } from "@/shared/services/card-snapshot";
import { ContactItemChipList } from "./contact-item-chip";
import { NextScanMenu } from "./next-scan-menu";
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
  onDisplayNameChange?: (displayName: string) => void;
  onNameEditingChange?: (editing: boolean) => void;
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
    onNameEditingChange,
    onCardUpdate,
  },
  ref,
) {
  const setCardItemOrder = useAppStore((state) => state.setCardItemOrder);
  const items = getCardItems(card, library);
  const compact = mode === "library";
  const nextScanAddons = getNextScanAddons(card);
  const [previewReorder, setPreviewReorder] = useState(false);
  const articleRef = useRef<HTMLElement | null>(null);

  const handleCommitOrder = useCallback(
    (orderedIds: string[]) => {
      setCardItemOrder(card.id, orderedIds);
    },
    [card.id, setCardItemOrder],
  );

  useEffect(() => {
    if (!previewReorder || !compact) return;

    const onPointerDown = (event: PointerEvent) => {
      const node = articleRef.current;
      if (!node || node.contains(event.target as Node)) return;
      setPreviewReorder(false);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [previewReorder, compact]);

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("[data-card-content]")) return;
    if (previewReorder) {
      setPreviewReorder(false);
      return;
    }
    onEmptyAreaTap();
  };

  return (
    <article
      ref={(node) => {
        articleRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
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
          ? "compass-card-library min-h-0 items-center justify-start px-5 pb-3"
          : "relative min-h-0 overflow-hidden px-5 pb-5",
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
      {!compact && onCardUpdate && card.displayName.trim() && card.photo ? (
        <NextScanMenu
          addons={nextScanAddons}
          onSetAddons={(addons) => onCardUpdate({ nextScanAddons: addons })}
        />
      ) : null}

      <div className={cn("flex flex-col items-center", !compact && "w-full shrink-0")}>
        {onPhotoChange ? (
          <PhotoSlotPicker
            photo={card.photo ?? null}
            onPhotoChange={onPhotoChange}
            sizePx={compact ? LIBRARY_PHOTO_SIZE_PX : CARD_PHOTO_SIZE_PX}
            borderRadiusPx={compact ? LIBRARY_PHOTO_RADIUS_PX : CARD_PHOTO_RADIUS_PX}
          />
        ) : card.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            data-card-content
            src={card.photo}
            alt=""
            className="shrink-0 rounded-[13px] border border-hairline object-cover"
            style={{ width: CARD_PHOTO_SIZE_PX, height: CARD_PHOTO_SIZE_PX, borderRadius: CARD_PHOTO_RADIUS_PX }}
          />
        ) : null}

        <div className="w-full text-center" style={{ marginTop: CARD_NAME_GAP_PX }}>
          {onDisplayNameChange ? (
            <CardNameField
              value={card.displayName}
              onChange={onDisplayNameChange}
              onEditingChange={onNameEditingChange}
              fontSizePx={CARD_NAME_SIZE_PX}
            />
          ) : (
            <p
              data-card-content
              className="font-light leading-[1.15] text-foreground"
              style={{ fontSize: CARD_NAME_SIZE_PX }}
            >
              {card.displayName}
            </p>
          )}
          {!compact && card.title ? (
            <p data-card-content className="mt-3 text-[30px] leading-[1.2] text-hint">
              {card.title}
            </p>
          ) : null}
        </div>

        {!compact ? <ContactItemChipList items={items} size="browse" /> : null}
      </div>

      {compact ? (
        <ContactItemChipList
          items={items}
          size="compact"
          className="min-h-0 flex-1 content-start overflow-y-auto px-1 pb-2"
          previewReorder={{
            active: previewReorder,
            onEnter: () => setPreviewReorder(true),
            onExit: () => setPreviewReorder(false),
            onCommit: handleCommitOrder,
          }}
        />
      ) : null}

    </article>
  );
});
