"use client";

import type { Card, ContactItem } from "@/shared/types";
import { useSwipe } from "@/shared/hooks/use-swipe";
import { getLibraryItems } from "@/features/portfolio/services/contact-item";
import { BusinessCard } from "./business-card";
import { LibraryPanel } from "./library-panel";

/** Compact card must fully cover the QR overlap zone (lower 2/3 of the code). */
const QR_OVERLAP = 112;

interface PortfolioStackProps {
  cards: Card[];
  currentIndex: number;
  library: ContactItem[];
  editing: boolean;
  cardTop: number;
  onIndexChange: (index: number) => void;
  onToggleEdit: () => void;
  onUpdate: (id: string, data: Partial<Card>) => void;
  onAddItem: () => void;
  onUpdateItem: (id: string, data: Partial<ContactItem>) => void;
  onDeleteItem: (id: string) => void;
}

export function PortfolioStack({
  cards,
  currentIndex,
  library,
  editing,
  cardTop,
  onIndexChange,
  onToggleEdit,
  onUpdate,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
}: PortfolioStackProps) {
  const total = cards.length;
  const card = cards[currentIndex];
  const cardItems = card ? getLibraryItems(card, library) : [];

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
      className="compass-ease absolute inset-x-0 bottom-0 z-20 flex flex-col"
      style={{
        top: `calc(env(safe-area-inset-top) + ${cardTop}px)`,
        background: "var(--background)",
      }}
      {...swipe}
    >
      {/* Content-height card — never shrink in the flex column. */}
      <div className="relative z-20 shrink-0">
        {total > 1 && !editing && (
          <div
            aria-hidden
            className="compass-sheet absolute rounded-[22px]"
            style={{
              top: 8,
              bottom: 8,
              right: 10,
              width: 64,
              background: "var(--sheet)",
            }}
          />
        )}

        <div
          className="relative"
          style={{
            marginLeft: editing ? 20 : 10,
            marginRight: editing ? 20 : 22,
            minHeight: editing ? QR_OVERLAP : undefined,
          }}
        >
          <BusinessCard
            card={card}
            library={library}
            variant={editing ? "compact" : "full"}
            onUpdate={(data) => onUpdate(card.id, data)}
            onToggleEdit={onToggleEdit}
          />
        </div>
      </div>

      {/* Library sheet: spine peek while browsing, full list when open. */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={editing}
        aria-label={editing ? "Close library" : "Open library"}
        onClick={onToggleEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleEdit();
          }
        }}
        className="compass-sheet compass-ease relative z-10 flex min-h-0 flex-1 cursor-pointer flex-col overflow-hidden"
        style={{
          background: "var(--sheet)",
          borderRadius: 24,
          marginTop: editing ? 10 : -22,
          marginLeft: editing ? 14 : 24,
          marginRight: editing ? 14 : 24,
          marginBottom: `calc(${editing ? 14 : 18}px + env(safe-area-inset-bottom))`,
        }}
      >
        {editing && (
          <LibraryPanel
            items={cardItems}
            onAddItem={onAddItem}
            onUpdateItem={onUpdateItem}
            onDeleteItem={onDeleteItem}
          />
        )}
      </div>
    </div>
  );
}
