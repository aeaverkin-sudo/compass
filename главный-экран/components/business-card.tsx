"use client";

import { forwardRef, type MouseEvent } from "react";
import { cn } from "@/lib/utils";
import type { Card, ContactItem } from "@/shared/types";
import { getCardItems } from "@/shared/services/card-snapshot";
import type { MainScreenMode } from "../layout";

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
          : "h-8 px-3.5 text-[13px] leading-none",
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
        "compass-card compass-layer w-full cursor-default transition-[transform,box-shadow] duration-[460ms] ease-out",
        compact ? "px-3.5 py-3" : "px-5 py-6",
      )}
    >
      <div className={cn("flex flex-col items-center", compact && "flex-row items-center gap-3")}>
        {card.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            data-card-content
            src={card.photo}
            alt=""
            className={cn(
              "shrink-0 rounded-full border border-hairline object-cover",
              compact ? "size-11" : "size-[84px]",
            )}
          />
        ) : null}

        <div className={cn("w-full text-center", compact && "min-w-0 flex-1 text-left")}>
          <p
            data-card-content
            className={cn(
              "font-normal leading-[1.12] text-foreground",
              compact ? "text-[16px]" : "text-[22px]",
            )}
          >
            {card.displayName}
          </p>
          {card.title ? (
            <p
              data-card-content
              className={cn("leading-[1.2] text-hint", compact ? "mt-0.5 text-[12px]" : "mt-1.5 text-[15px]")}
            >
              {card.title}
            </p>
          ) : (
            <p className={cn("leading-[1.2] text-hint", compact ? "mt-0.5 text-[12px]" : "mt-1.5 text-[15px]")}>
              title
            </p>
          )}
        </div>

        {!compact && items.length > 0 ? (
          <div className="mt-5 flex w-full flex-wrap justify-center gap-2">
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
    </article>
  );
});
