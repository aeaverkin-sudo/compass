"use client";

import { useMemo } from "react";
import type { Card, ContactItem } from "@/shared/types";
import { useSwipe } from "@/shared/hooks/use-swipe";
import { BusinessCard } from "./business-card";

interface CardCarouselProps {
  cards: Card[];
  currentIndex: number;
  library: ContactItem[];
  expanded: boolean;
  onIndexChange: (index: number) => void;
  onExpand: () => void;
  onCollapse: () => void;
  onUpdate: (id: string, data: Partial<Card>) => void;
  onRemoveItem: (cardId: string, itemId: string) => void;
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
  expanded,
  onIndexChange,
  onExpand,
  onCollapse,
  onUpdate,
  onRemoveItem,
}: CardCarouselProps) {
  const total = cards.length;

  const swipe = useSwipe({
    onSwipeLeft: () => {
      if (expanded) return;
      onIndexChange((currentIndex + 1) % total);
    },
    onSwipeRight: () => {
      if (expanded) return;
      onIndexChange((currentIndex - 1 + total) % total);
    },
  });

  const card = cards[currentIndex];

  const positions = useMemo(() => {
    if (expanded) return [];
    return cards.map((c, i) => {
      const rel = relativeIndex(i, currentIndex, total);
      return { card: c, rel };
    });
  }, [cards, currentIndex, total, expanded]);

  if (expanded && card) {
    return (
      <BusinessCard
        card={card}
        library={library}
        expanded
        onExpand={onExpand}
        onCollapse={onCollapse}
        onUpdate={(data) => onUpdate(card.id, data)}
        onRemoveItem={(itemId) => onRemoveItem(card.id, itemId)}
      />
    );
  }

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden py-2" {...swipe}>
      <div className="relative flex h-[240px] w-full items-center justify-center">
        {positions.map(({ card: c, rel }) => {
          if (Math.abs(rel) > 1) return null;
          const isCenter = rel === 0;
          const translateX = rel * 200;
          const scale = isCenter ? 1 : 0.82;
          const opacity = isCenter ? 1 : 0.55;
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
                  expanded={false}
                  onExpand={onExpand}
                  onCollapse={onCollapse}
                  onUpdate={(data) => onUpdate(c.id, data)}
                  onRemoveItem={(itemId) => onRemoveItem(c.id, itemId)}
                />
              ) : (
                <div
                  className="h-[200px] w-[60px] overflow-hidden rounded-xl bg-white"
                  style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}
                >
                  {c.photo && (
                    <img src={c.photo} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {total > 1 && (
        <div className="mt-2 flex gap-1.5">
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
