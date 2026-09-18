"use client";

import type { Card, ContactItem } from "@/shared/types";
import { getCardItems } from "@/shared/services/card-snapshot";

type BusinessCardProps = {
  card: Card;
  library: ContactItem[];
};

function ContactChip({ item }: { item: ContactItem }) {
  return (
    <span className="inline-flex max-w-full items-center rounded-[10px] bg-[oklch(94%_0.008_70)] px-3 py-1.5 text-[13px] leading-none text-foreground">
      <span className="truncate">{item.value}</span>
    </span>
  );
}

export function BusinessCard({ card, library }: BusinessCardProps) {
  const items = getCardItems(card, library);

  return (
    <article className="compass-card mx-5 flex h-full min-h-0 flex-col overflow-hidden px-6 py-6">
      <div className="flex min-h-0 flex-1 flex-col items-center">
        {card.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.photo}
            alt=""
            className="size-[72px] shrink-0 rounded-full border border-hairline object-cover"
          />
        ) : null}

        <div className="mt-4 w-full text-center">
          <p className="text-[21px] leading-[1.15] text-foreground">{card.displayName}</p>
          {card.title ? (
            <p className="mt-1.5 text-[14px] leading-[1.2] text-hint">{card.title}</p>
          ) : (
            <p className="mt-1.5 text-[14px] leading-[1.2] text-hint">title</p>
          )}
        </div>

        {items.length > 0 ? (
          <div className="mt-5 flex w-full flex-wrap justify-center gap-2">
            {items.map((item) => (
              <ContactChip key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <p className="mt-5 text-center text-[13px] text-hint">Контакты появятся здесь</p>
        )}
      </div>
    </article>
  );
}
