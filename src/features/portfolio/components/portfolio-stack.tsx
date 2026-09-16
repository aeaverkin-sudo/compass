"use client";

import type { Card, ContactItem } from "@/shared/types";
import { useSwipe } from "@/shared/hooks/use-swipe";
import { useElementHeight } from "@/shared/hooks/use-element-size";
import {
  getCardItems,
  sortContactList,
} from "@/features/portfolio/services/contact-item";
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
  canAddCard: boolean;
  onIndexChange: (index: number) => void;
  onToggleEdit: () => void;
  onAddCard: () => void;
  onUpdate: (id: string, data: Partial<Card>) => void;
  onAddItem: () => void;
  onAttachFile: (file: File, itemId?: string) => void | Promise<void>;
  onUpdateItem: (id: string, data: Partial<ContactItem>) => void;
  onToggleOnCard: (itemId: string) => void;
}

function PlusGlyph({ size = 15 }: { size?: number }) {
  const bar = {
    position: "absolute" as const,
    borderRadius: 2,
    background: "var(--glyph)",
  };
  return (
    <span className="relative block" style={{ width: size, height: size }}>
      <span style={{ ...bar, left: 0, right: 0, top: size * 0.45, height: 1.6 }} />
      <span style={{ ...bar, top: 0, bottom: 0, left: size * 0.45, width: 1.6 }} />
    </span>
  );
}

export function PortfolioStack({
  cards,
  currentIndex,
  library,
  editing,
  canAddCard,
  onIndexChange,
  onToggleEdit,
  onAddCard,
  onUpdate,
  onAddItem,
  onAttachFile,
  onUpdateItem,
  onToggleOnCard,
}: PortfolioStackProps) {
  const total = cards.length;
  const card = cards[currentIndex];
  const activeIds = card?.contactItemIds ?? [];
  const peekItems = card ? getCardItems(card, library) : [];
  const editItems = card ? sortContactList(library, activeIds) : [];

  const { ref: cardRef, height: cardHeight } = useElementHeight<HTMLDivElement>([
    editing,
    card?.id,
    card?.displayName,
    card?.contactItemIds.length,
    library.length,
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

  const showNextSliver = total > 1 && !editing;
  const showAddCard = canAddCard && !editing;

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
        {showNextSliver && (
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

        {showAddCard && (
          <button
            type="button"
            data-no-toggle
            aria-label="Add another card"
            onClick={(e) => {
              e.stopPropagation();
              onAddCard();
            }}
            className="compass-sheet absolute flex items-center justify-center rounded-[22px]"
            style={{
              top: 10,
              bottom: 10,
              right: showNextSliver ? 4 : -6,
              width: showNextSliver ? 40 : 44,
              background: "var(--sheet)",
            }}
          >
            <PlusGlyph size={showNextSliver ? 13 : 15} />
          </button>
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
          items={editing ? editItems : peekItems}
          mode={editing ? "edit" : "peek"}
          activeIds={activeIds}
          onAddItem={onAddItem}
          onAttachFile={onAttachFile}
          onUpdateItem={onUpdateItem}
          onToggleOnCard={onToggleOnCard}
        />
      </div>
    </div>
  );
}
