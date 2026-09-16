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
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden py-2 pb-[calc(56px+env(safe-area-inset-bottom))]" {...swipe}>
      <div className="relative flex w-full flex-1 items-center justify-center">
        {positions.map(({ card: c, rel }) => {
          if (Math.abs(rel) > 1) return null;
          const isCenter = rel === 0;
          const translateX = rel * 220;
          const scale = isCenter ? 1 : 0.88;
          const opacity = isCenter ? 1 : 0.45;
          const zIndex = isCenter ? 10 : 5 - Math.abs(rel);

          return (
            <div
              key={c.id}
              className="absolute transition-all duration-300 ease-out"
              style={{
                transform: `translateX(${translateX}px) scale(${scale})`,
                opacity,
                zIndex,
                pointerEvents: isCenter ? "auto" : "none",
              }}
            >
              {isCenter ? (
                <BusinessCard
                  card={c}
                  library={library}
                  variant="full"
                  onUpdate={(data) => onUpdate(c.id, data)}
                />
              ) : (
                <div
                  className="h-[220px] w-[52px] overflow-hidden rounded-xl bg-white"
                  style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}
                >
                  {c.photo && <img src={c.photo} alt="" className="h-full w-full object-cover" />}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {total > 1 && (
        <div className="mt-1 flex shrink-0 gap-1.5 pb-1">
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
