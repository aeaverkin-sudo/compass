"use client";

import { forwardRef, type MouseEvent } from "react";
import { cn } from "@/lib/utils";
import type { Card, ContactItem } from "@/shared/types";
import { getCardItems } from "@/shared/services/card-snapshot";
import {
  browseCardHeight,
  CARD_PHOTO_RADIUS_PX,
  CARD_PHOTO_SIZE_PX,
  CARD_PHOTO_TOP_PX,
  CARD_NAME_GAP_PX,
  CARD_NAME_SIZE_PX,
  type MainScreenMode,
} from "../layout";

type BusinessCardProps = {
  card: Card;
  library: ContactItem[];
  mode: MainScreenMode;
  onEmptyAreaTap: () => void;
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
  { card, library, mode, onEmptyAreaTap },
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
      aria-label={compact ? "Вернуться к визитке" : "Визитка"}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEmptyAreaTap();
        }
      }}
      className={cn(
        "compass-card compass-layer flex w-full cursor-default flex-col transition-[transform,box-shadow,height] duration-[460ms] ease-out",
        compact ? "px-3.5 py-3" : "min-h-0 overflow-hidden px-5 pb-5",
      )}
      style={
        compact
          ? undefined
          : {
              height: browseCardHeight(),
              paddingTop: CARD_PHOTO_TOP_PX,
            }
      }
    >
      <div className={cn("shrink-0 flex flex-col items-center", compact && "flex-row items-center gap-3")}>
        {card.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            data-card-content
            src={card.photo}
            alt=""
            className={cn(
              "shrink-0 border border-hairline object-cover",
              compact
                ? "size-11 rounded-[10px]"
                : "rounded-[13px]",
            )}
            style={
              compact
                ? undefined
                : { width: CARD_PHOTO_SIZE_PX, height: CARD_PHOTO_SIZE_PX, borderRadius: CARD_PHOTO_RADIUS_PX }
            }
          />
        ) : null}

        <div
          className={cn("w-full text-center", compact && "min-w-0 flex-1 text-left")}
          style={compact ? undefined : { marginTop: CARD_NAME_GAP_PX }}
        >
          <p
            data-card-content
            className={cn(
              "font-normal leading-[1.12] text-foreground",
              compact ? "text-[16px]" : undefined,
            )}
            style={compact ? undefined : { fontSize: CARD_NAME_SIZE_PX }}
          >
            {card.displayName}
          </p>
          {card.title ? (
            <p
              data-card-content
              className={cn("leading-[1.2] text-hint", compact ? "mt-0.5 text-[12px]" : "mt-3 text-[30px]")}
            >
              {card.title}
            </p>
          ) : (
            <p className={cn("leading-[1.2] text-hint", compact ? "mt-0.5 text-[12px]" : "mt-3 text-[30px]")}>
              title
            </p>
          )}
        </div>

        {!compact && items.length > 0 ? (
          <div className="mt-8 flex w-full flex-wrap justify-center gap-3">
            {items.map((item) => (
              <ContactChip key={item.id} item={item} compact={false} />
            ))}
          </div>
        ) : null}

        {compact && items.length > 0 ? (
          <div className="flex max-w-[42%] flex-wrap justify-end gap-1.5">
            {items.slice(0, 2).map((item) => (
              <ContactChip key={item.id} item={item} compact />
            ))}
          </div>
        ) : null}
      </div>

      {!compact ? (
        <div className="mt-6 flex min-h-0 flex-1 flex-col overflow-hidden">
          <p className="mb-4 shrink-0 text-center text-[13px] leading-[1.25] text-hint">
            link, email, phone, file…
          </p>
          <div className="compass-sheet-body mx-1 mb-4 min-h-0 flex-1 rounded-[14px]" aria-hidden />
          <div className="mx-auto h-[14px] w-[88%] shrink-0 rounded-full bg-hairline/12" aria-hidden />
        </div>
      ) : null}
    </article>
  );
});
