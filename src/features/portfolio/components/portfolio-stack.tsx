"use client";

import type { Card, ContactItem } from "@/shared/types";
import { useSwipe } from "@/shared/hooks/use-swipe";
import { useElementHeight } from "@/shared/hooks/use-element-size";
import { getLibraryItems } from "@/features/portfolio/services/contact-item";
import {
  CARD_MARGIN,
  CARD_TOP_BROWSE,
  CARD_TOP_LIBRARY,
  LIBRARY_MARGIN,
  QR_OVERLAP,
  safeBottom,
  safeTop,
} from "@/features/portfolio/constants/layout";
import { BusinessCard } from "./business-card";
import { LibraryPanel } from "./library-panel";

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
  onDeleteItem: (id: string) => void;
}

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
  onDeleteItem,
}: PortfolioStackProps) {
  const total = cards.length;
  const card = cards[currentIndex];
  const cardItems = card ? getLibraryItems(card, library) : [];
  const { ref: cardRef, height: cardHeight } = useElementHeight<HTMLDivElement>([
    editing,
    card?.id,
    card?.displayName,
    card?.contactItemIds.length,
  ]);

  const cardTop = editing ? CARD_TOP_LIBRARY : CARD_TOP_BROWSE;
  const cardMargin = editing ? CARD_MARGIN.library : CARD_MARGIN.browse;
  const libraryOffset = editing
    ? LIBRARY_MARGIN.library.gap
    : -LIBRARY_MARGIN.browse.overlap;
  const libMargin = editing ? LIBRARY_MARGIN.library : LIBRARY_MARGIN.browse;

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

  const libraryTop =
    cardHeight > 0
      ? safeTop(cardTop + cardHeight + libraryOffset)
      : safeTop(
          cardTop +
            (editing ? QR_OVERLAP + LIBRARY_MARGIN.library.gap : 120),
        );

  return (
    <div className="absolute inset-0 z-20" {...swipe}>
      {/* Card — absolute, only its top animates between browse and library. */}
      <div
        ref={cardRef}
        className="compass-ease absolute z-20"
        style={{
          top: safeTop(cardTop),
          left: cardMargin.left,
          right: cardMargin.right,
        }}
      >
        {total > 1 && !editing && (
          <div
            aria-hidden
            className="compass-sheet pointer-events-none absolute rounded-[22px]"
            style={{
              top: 10,
              bottom: 10,
              right: -6,
              width: 14,
              background: "var(--sheet)",
            }}
          />
        )}

        <BusinessCard
          card={card}
          library={library}
          variant={editing ? "compact" : "full"}
          onUpdate={(data) => onUpdate(card.id, data)}
          onToggleEdit={onToggleEdit}
        />
      </div>

      {/* Library — pinned to the bottom; top follows the measured card edge. */}
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
        className={`compass-ease absolute z-10 flex cursor-pointer flex-col overflow-hidden ${
          editing ? "compass-sheet" : "compass-sheet compass-sheet-peek"
        }`}
        style={{
          top: libraryTop,
          left: libMargin.left,
          right: libMargin.right,
          bottom: safeBottom(libMargin.bottom),
          background: "var(--sheet)",
          borderRadius: 24,
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
