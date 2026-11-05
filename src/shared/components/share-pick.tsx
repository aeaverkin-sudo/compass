"use client";

import { cardPhotoSrc } from "@/shared/services/card-photo";
import { useAppStore } from "@/shared/store/app-store";

export type SharePickCard = {
  id: string;
  name: string;
  photo: string | null;
};

/** Named portfolios, in the order the app keeps them. A card with no name is not offered. */
export function useNamedShareCards(): SharePickCard[] {
  const cards = useAppStore((state) => state.cards);
  return cards.flatMap((card) => {
    const name = card.displayName.trim();
    if (!name) return [];
    return [{ id: card.id, name, photo: cardPhotoSrc(card) }];
  });
}

/** The same list in the hold menu (26px) and on the open contact (34px). */
export function SharePick({
  cards,
  size,
  onPick,
}: {
  cards: SharePickCard[];
  size: "menu" | "plaque";
  onPick: (card: SharePickCard) => void;
}) {
  const photo = size === "menu" ? 26 : 34;
  return (
    <div className="flex flex-col" style={{ gap: size === "menu" ? 5 : 10 }}>
      {cards.map((card) => (
        <button
          key={card.id}
          type="button"
          onClick={() => onPick(card)}
          className="press flex w-full min-w-0 items-center gap-3 border-0 bg-transparent p-0 text-left [-webkit-tap-highlight-color:transparent]"
        >
          {card.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.photo}
              alt=""
              className="shrink-0 object-cover"
              style={{ width: photo, height: photo }}
            />
          ) : (
            <span className="shrink-0 bg-[#d9d9d9]" style={{ width: photo, height: photo }} aria-hidden />
          )}
          <span className="min-w-0 truncate t-body text-[var(--ink)]">{card.name}</span>
        </button>
      ))}
    </div>
  );
}
