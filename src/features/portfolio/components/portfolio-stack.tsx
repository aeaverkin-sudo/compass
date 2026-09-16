"use client";

import type { Card, ContactItem } from "@/shared/types";
import { useSwipe } from "@/shared/hooks/use-swipe";
import { BusinessCard } from "./business-card";
import { DataLayer } from "./data-layer";

interface PortfolioStackProps {
  cards: Card[];
  currentIndex: number;
  library: ContactItem[];
  editing: boolean;
  onIndexChange: (index: number) => void;
  onToggleEdit: () => void;
  onUpdate: (id: string, data: Partial<Card>) => void;
  onAddItem: () => void;
  onUpdateItem: (id: string, data: Partial<ContactItem>) => void;
  onToggleActive: (itemId: string) => void;
}

const CARD_TOP_BROWSE = "26vh";
const CARD_TOP_EDIT = "10vh";
const FIELDS_PEEK = "calc(104px + env(safe-area-inset-bottom))";

export function PortfolioStack({
  cards,
  currentIndex,
  library,
  editing,
  onIndexChange,
  onToggleEdit,
  onUpdate,
  onAddItem,
  onUpdateItem,
  onToggleActive,
}: PortfolioStackProps) {
  const total = cards.length;
  const card = cards[currentIndex];

  const swipe = useSwipe({
    onSwipeLeft: () => {
      if (editing || total <= 1) return;
      onIndexChange((currentIndex + 1) % total);
    },
    onSwipeRight: () => {
      if (editing || total <= 1) return;
      onIndexChange((currentIndex - 1 + total) % total);
    },
  });

  if (!card) return null;

  // Before the card has a name there is nothing to scan or list yet.
  if (!card.displayName.trim()) {
    return (
      <div className="absolute inset-0 z-20 flex items-center px-6">
        <BusinessCard
          card={card}
          library={library}
          variant="full"
          onUpdate={(data) => onUpdate(card.id, data)}
        />
      </div>
    );
  }

  return (
    <div
      className="compass-ease absolute inset-x-0 bottom-0 z-20 flex flex-col px-4"
      style={{ top: editing ? CARD_TOP_EDIT : CARD_TOP_BROWSE }}
      {...swipe}
    >
      <div
        className={`flex min-h-0 ${
          editing ? "shrink-0" : "flex-1 items-start overflow-hidden"
        }`}
      >
        <div className={editing ? "w-full" : "max-h-full w-full overflow-y-auto scrollbar-hide"}>
          <BusinessCard
            card={card}
            library={library}
            variant={editing ? "preview" : "full"}
            onUpdate={(data) => onUpdate(card.id, data)}
            onToggleEdit={onToggleEdit}
          />
        </div>
      </div>

      {total > 1 && (
        <div className="flex shrink-0 justify-center gap-1.5 py-2.5">
          {cards.map((c, i) => (
            <span
              key={c.id}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === currentIndex ? "w-4 bg-[#a09a90]" : "w-1.5 bg-[#d8d3cb]"
              }`}
            />
          ))}
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        aria-expanded={editing}
        aria-label={editing ? "Collapse fields" : "Open fields"}
        onClick={onToggleEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleEdit();
          }
        }}
        className={`compass-fields compass-ease relative z-10 flex cursor-pointer flex-col overflow-hidden rounded-t-[24px] bg-white pt-4 ${
          editing ? "min-h-0 flex-1" : "shrink-0"
        } ${total > 1 ? "" : "mt-2.5"}`}
        style={{
          height: editing ? undefined : FIELDS_PEEK,
          paddingBottom: "calc(6px + env(safe-area-inset-bottom))",
        }}
      >
        <DataLayer
          card={card}
          library={library}
          editing={editing}
          onAddItem={onAddItem}
          onUpdateItem={onUpdateItem}
          onToggleActive={onToggleActive}
        />
      </div>
    </div>
  );
}
