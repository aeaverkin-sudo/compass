"use client";

import type { Card, ContactItem } from "@/shared/types";
import { useSwipe } from "@/shared/hooks/use-swipe";
import { useElementHeight } from "@/shared/hooks/use-element-size";
import { getLibraryItems } from "@/features/portfolio/services/contact-item";
import {
  CARD_TOP_BROWSE,
  CARD_TOP_LIBRARY,
  QR_OVERLAP,
  safeBottom,
  safeTop,
  SHEET_INSET,
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
  onAttachFile: (file: File, itemId?: string) => void | Promise<void>;
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
  onAttachFile,
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

  const inset = editing ? SHEET_INSET.library : SHEET_INSET.browse;
  const cardTop = editing ? CARD_TOP_LIBRARY : CARD_TOP_BROWSE;
  const libraryOffset = editing
    ? SHEET_INSET.library.gap
    : -SHEET_INSET.browse.overlap;

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
      : safeTop(cardTop + (editing ? QR_OVERLAP + SHEET_INSET.library.gap : 120));

  return (
    <div className="absolute inset-0 z-20" {...swipe}>
      <div
        ref={cardRef}
        className="compass-ease absolute z-20"
        style={{
          top: safeTop(cardTop),
          left: inset.left,
          right: inset.right,
        }}
      >
        {total > 1 && !editing && (
          <div
            aria-hidden
            className="compass-sheet pointer-events-none absolute rounded-[22px]"
            style={{
              top: 10,
              bottom: 10,
              right: -8,
              width: 12,
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
          left: inset.left,
          right: inset.right,
          bottom: safeBottom(inset.bottom),
          background: "var(--sheet)",
          borderRadius: 24,
        }}
      >
        <LibraryPanel
          items={cardItems}
          mode={editing ? "edit" : "peek"}
          onAddItem={onAddItem}
          onAttachFile={onAttachFile}
          onUpdateItem={onUpdateItem}
          onDeleteItem={onDeleteItem}
        />
      </div>
    </div>
  );
}
