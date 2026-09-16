"use client";

import { useMemo } from "react";
import type { Card, ContactItem } from "@/shared/types";
import { useSwipe } from "@/shared/hooks/use-swipe";
import { BusinessCard } from "./business-card";

interface CardCarouselProps {
  cards: Card[];
  currentIndex: number;
  library: ContactItem[];
  editing: boolean;
  onIndexChange: (index: number) => void;
  onCloseEdit: () => void;
  onUpdate: (id: string, data: Partial<Card>) => void;
}

function relativeIndex(i: number, current: number, total: number): number {
  let rel = i - current;
  const half = total / 2;
  if (rel > half) rel -= total;
  if (rel < -half) rel += total;
  return rel;
}

function CardPeek({ card, empty }: { card?: Card; empty?: boolean }) {
  return (
    <div
      className="h-[min(58vh,560px)] w-11 overflow-hidden rounded-2xl bg-white"
      style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.07)" }}
    >
      {empty ? (
        <div className="h-full w-full bg-gradient-to-b from-[#fafafa] to-[#f0f0f0]" />
      ) : card?.photo ? (
        <img src={card.photo} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full bg-[#f5f5f5]" />
      )}
    </div>
  );
}

export function CardCarousel({
  cards,
  currentIndex,
  library,
  editing,
  onIndexChange,
  onCloseEdit,
  onUpdate,
}: CardCarouselProps) {
  const total = cards.length;
  const card = cards[currentIndex];

  const swipe = useSwipe({
    onSwipeLeft: () => {
      if (editing) return;
      onIndexChange((currentIndex + 1) % total);
    },
    onSwipeRight: () => {
      if (editing) return;
      onIndexChange((currentIndex - 1 + total) % total);
    },
  });

  const positions = useMemo(
    () =>
      cards.map((c, i) => ({
        card: c,
        rel: relativeIndex(i, currentIndex, total),
      })),
    [cards, currentIndex, total],
  );

  const nextRel = positions.find((p) => p.rel === 1);
  const prevRel = positions.find((p) => p.rel === -1);
  const showGhostRight = total === 1 && !editing;

  if (editing && card) {
    return (
      <div className="relative z-30 shrink-0 pt-1 pb-2">
        <BusinessCard
          card={card}
          library={library}
          variant="compact"
          onUpdate={(data) => onUpdate(card.id, data)}
          onCloseEdit={onCloseEdit}
        />
      </div>
    );
  }

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden pb-[calc(96px+env(safe-area-inset-bottom))] pt-1"
      {...swipe}
    >
      <div className="relative mx-auto flex h-full w-full max-w-lg flex-1 items-center justify-center px-3">
        {/* Left peek */}
        {prevRel && (
          <div
            className="pointer-events-none absolute left-1 top-1/2 z-[5] -translate-y-1/2 transition-all duration-300"
            style={{ opacity: 0.45 }}
          >
            <CardPeek card={prevRel.card} />
          </div>
        )}

        {/* Center card — shifted slightly left so right peek is visible */}
        <div className="relative z-10 w-full max-w-[calc(100%-2.5rem)] -translate-x-2 transition-transform duration-300">
          {card && (
            <BusinessCard
              card={card}
              library={library}
              variant="full"
              onUpdate={(data) => onUpdate(card.id, data)}
            />
          )}
        </div>

        {/* Right peek — next card or empty hint */}
        {(nextRel || showGhostRight) && (
          <div
            className="pointer-events-none absolute right-1 top-1/2 z-[5] -translate-y-1/2 transition-all duration-300"
            style={{ opacity: showGhostRight ? 0.35 : 0.5 }}
          >
            <CardPeek card={nextRel?.card} empty={showGhostRight} />
          </div>
        )}
      </div>

      {total > 1 && (
        <div className="mt-2 flex shrink-0 justify-center gap-1.5 pb-1">
          {cards.map((c, i) => (
            <div
              key={c.id}
              className={`h-1.5 w-1.5 rounded-full transition-colors ${
                i === currentIndex ? "bg-[#666]" : "bg-[#ddd]"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
