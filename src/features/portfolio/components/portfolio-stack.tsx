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
  onEnterEdit: () => void;
  onExitEdit: () => void;
  onUpdate: (id: string, data: Partial<Card>) => void;
  onAddItem: () => void;
  onUpdateItem: (id: string, data: Partial<ContactItem>) => void;
  onToggleActive: (itemId: string) => void;
}

export function PortfolioStack({
  cards,
  currentIndex,
  library,
  editing,
  onIndexChange,
  onEnterEdit,
  onExitEdit,
  onUpdate,
  onAddItem,
  onUpdateItem,
  onToggleActive,
}: PortfolioStackProps) {
  const total = cards.length;
  const card = cards[currentIndex];

  const horizontalSwipe = useSwipe({
    onSwipeLeft: () => {
      if (editing || total <= 1) return;
      onIndexChange((currentIndex + 1) % total);
    },
    onSwipeRight: () => {
      if (editing || total <= 1) return;
      onIndexChange((currentIndex - 1 + total) % total);
    },
  });

  const cardSwipe = useSwipe({
    onSwipeUp: () => {
      if (!editing) onEnterEdit();
    },
    onSwipeDown: () => {
      if (editing) onExitEdit();
    },
  });

  if (!card) return null;

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
      {...horizontalSwipe}
    >
      {/* Floating card layer */}
      <div
        className="relative z-20 shrink-0 px-3 transition-all duration-[400ms] ease-out"
        style={{
          marginTop: editing ? "-10vh" : "4px",
          transform: editing ? "scale(0.94)" : "scale(1)",
          transformOrigin: "top center",
        }}
        {...cardSwipe}
      >
        <BusinessCard
          card={card}
          library={library}
          variant={editing ? "preview" : "full"}
          onUpdate={(data) => onUpdate(card.id, data)}
          onCloseEdit={onExitEdit}
          onBlankAreaTap={!editing ? onEnterEdit : undefined}
        />
      </div>

      {/* Data layer — always visible, expands in edit mode */}
      <div
        className={`relative z-10 mx-3 flex min-h-0 flex-col rounded-t-2xl bg-white transition-all duration-[400ms] ease-out ${
          editing ? "mt-1 flex-1 shadow-none" : "-mt-3 flex-shrink-0 shadow-[0_-2px_20px_rgba(0,0,0,0.06)]"
        }`}
        style={{
          paddingBottom: editing ? 0 : "calc(8px + env(safe-area-inset-bottom))",
        }}
        role={!editing ? "button" : undefined}
        tabIndex={!editing ? 0 : undefined}
        onClick={!editing ? onEnterEdit : undefined}
        onKeyDown={
          !editing
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") onEnterEdit();
              }
            : undefined
        }
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

      {total > 1 && !editing && (
        <div className="flex shrink-0 justify-center gap-1.5 py-2">
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
