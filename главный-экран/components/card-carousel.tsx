"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/shared/store/app-store";
import type { Card, ContactItem } from "@/shared/types";
import { cn } from "@/lib/utils";
import {
  CARD_CAROUSEL_GAP_PX,
  carouselSidePaddingPx,
  carouselSlideWidthPx,
  SHEET_INSET,
  type MainScreenMode,
} from "../layout";
import { BusinessCard } from "./business-card";
import { CardDraftFields } from "./card-draft-fields";

const ADD_SLIDE_ID = "__add__";

type CardCarouselProps = {
  cards: Card[];
  activeIndex: number;
  contactItems: ContactItem[];
  mode: MainScreenMode;
  edgeInsetPx: number;
  canAddCard: boolean;
  libraryCardHeightPx?: number;
  onActiveIndexChange: (index: number) => void;
  onUpdateCard: (id: string, data: Partial<Card>) => void;
  onEmptyAreaTap: () => void;
  onNameEditingChange?: (editing: boolean) => void;
};

function CarouselSpacer({ width }: { width: number }) {
  return <div aria-hidden className="shrink-0" style={{ width }} />;
}

function isDraftCard(card: Card, index: number) {
  return index > 0 && (!card.photo || !card.displayName.trim());
}

const EMPTY_DRAFT: Card = {
  id: ADD_SLIDE_ID,
  displayName: "",
  title: "",
  contactItemIds: [],
  nextScanAddons: [],
  createdAt: "",
  updatedAt: "",
};

export function CardCarousel({
  cards,
  activeIndex,
  contactItems,
  mode,
  edgeInsetPx: _edgeInsetPx,
  canAddCard,
  libraryCardHeightPx,
  onActiveIndexChange,
  onUpdateCard,
  onEmptyAreaTap,
  onNameEditingChange,
}: CardCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const syncingScroll = useRef(false);
  const scrolledRecently = useRef(false);
  const scrollResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const isBrowse = mode === "browse";
  const multiSlide = cards.length > 1 || canAddCard;
  const activeCard = cards[activeIndex] ?? cards[0];

  const slideIds = useMemo(() => {
    const ids = cards.map((card) => card.id);
    if (canAddCard) ids.push(ADD_SLIDE_ID);
    return ids;
  }, [cards, canAddCard]);

  const slideWidthPx = useMemo(() => {
    if (!multiSlide || containerWidth === 0) return 0;
    return carouselSlideWidthPx(containerWidth, true, SHEET_INSET.browse.horizontal);
  }, [containerWidth, multiSlide]);

  const sidePaddingPx = useMemo(() => {
    if (!multiSlide || slideWidthPx === 0 || containerWidth === 0) return 0;
    return carouselSidePaddingPx(containerWidth, true, SHEET_INSET.browse.horizontal);
  }, [containerWidth, multiSlide, slideWidthPx]);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node || !multiSlide) return;

    const sync = () => {
      setContainerWidth(node.clientWidth);
    };
    sync();

    const observer = new ResizeObserver(sync);
    observer.observe(node);
    window.addEventListener("resize", sync);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [multiSlide]);

  const scrollLeftForIndex = useCallback(
    (index: number) => {
      const node = scrollRef.current;
      if (!node || slideWidthPx === 0) return 0;
      const step = slideWidthPx + CARD_CAROUSEL_GAP_PX;
      return sidePaddingPx + index * step + slideWidthPx / 2 - node.clientWidth / 2;
    },
    [sidePaddingPx, slideWidthPx],
  );

  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = "smooth") => {
      const node = scrollRef.current;
      if (!node || !multiSlide || slideWidthPx === 0) return;
      node.scrollTo({ left: scrollLeftForIndex(index), behavior });
    },
    [multiSlide, scrollLeftForIndex, slideWidthPx],
  );

  const updateSecondCardDraft = useAppStore((state) => state.updateSecondCardDraft);

  const handleDraftUpdate = useCallback(
    (data: Partial<Pick<Card, "displayName" | "photo">>) => {
      updateSecondCardDraft(data);
    },
    [updateSecondCardDraft],
  );

  useEffect(() => {
    if (!multiSlide || slideWidthPx === 0) return;
    syncingScroll.current = true;
    scrollToIndex(activeIndex, "auto");
    requestAnimationFrame(() => {
      syncingScroll.current = false;
    });
  }, [activeIndex, multiSlide, scrollToIndex, slideWidthPx]);

  useEffect(() => {
    if (!multiSlide) return;

    const onResize = () => scrollToIndex(activeIndex, "auto");
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [activeIndex, multiSlide, scrollToIndex]);

  const markScrolled = () => {
    scrolledRecently.current = true;
    if (scrollResetTimer.current) clearTimeout(scrollResetTimer.current);
    scrollResetTimer.current = setTimeout(() => {
      scrolledRecently.current = false;
    }, 280);
  };

  const handleScroll = () => {
    if (syncingScroll.current || !scrollRef.current || !multiSlide || slideWidthPx === 0) return;

    const node = scrollRef.current;
    const step = slideWidthPx + CARD_CAROUSEL_GAP_PX;
    const viewportCenter = node.scrollLeft + node.clientWidth / 2;

    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < cards.length; i++) {
      const slideCenter = sidePaddingPx + i * step + slideWidthPx / 2;
      const distance = Math.abs(viewportCenter - slideCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = i;
      }
    }

    if (closestIndex !== activeIndex) {
      markScrolled();
      syncingScroll.current = true;
      onActiveIndexChange(closestIndex);
      requestAnimationFrame(() => {
        syncingScroll.current = false;
      });
    }
  };

  const handleEmptyAreaTap = () => {
    if (scrolledRecently.current) return;
    onEmptyAreaTap();
  };

  const handlePhotoChange = useCallback(
    (cardId: string, photo: string | null) => {
      onUpdateCard(cardId, { photo: photo ?? undefined });
    },
    [onUpdateCard],
  );

  const renderSlide = (slideId: string, index: number) => {
    if (slideId === ADD_SLIDE_ID) {
      return <CardDraftFields card={cards[1] ?? EMPTY_DRAFT} onUpdate={handleDraftUpdate} />;
    }

    const card = cards[index]!;
    if (isDraftCard(card, index)) {
      return <CardDraftFields card={card} onUpdate={(data) => onUpdateCard(card.id, data)} />;
    }

    return (
      <BusinessCard
        card={card}
        library={contactItems}
        mode={mode}
        libraryCardHeightPx={libraryCardHeightPx}
        onEmptyAreaTap={handleEmptyAreaTap}
        onPhotoChange={(photo) => handlePhotoChange(card.id, photo)}
        onDisplayNameChange={(displayName) => onUpdateCard(card.id, { displayName })}
        onNameEditingChange={onNameEditingChange}
        onCardUpdate={(data) => onUpdateCard(card.id, data)}
      />
    );
  };

  if (!activeCard) return null;

  if (!multiSlide) {
    if (isBrowse && isDraftCard(activeCard, activeIndex)) {
      return <CardDraftFields card={activeCard} onUpdate={(data) => onUpdateCard(activeCard.id, data)} />;
    }

    return (
      <BusinessCard
        card={activeCard}
        library={contactItems}
        mode={mode}
        libraryCardHeightPx={libraryCardHeightPx}
        onEmptyAreaTap={handleEmptyAreaTap}
        onPhotoChange={(photo) => handlePhotoChange(activeCard.id, photo)}
        onDisplayNameChange={(displayName) => onUpdateCard(activeCard.id, { displayName })}
        onNameEditingChange={onNameEditingChange}
        onCardUpdate={(data) => onUpdateCard(activeCard.id, data)}
      />
    );
  }

  if (slideWidthPx === 0) {
    return (
      <div className="h-full overflow-hidden">
        <div ref={scrollRef} className="compass-carousel h-full" aria-hidden />
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden">
      <div
        ref={scrollRef}
        className="compass-carousel h-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden bg-background-ready"
        onScroll={handleScroll}
      >
        <div className="flex h-full" style={{ gap: CARD_CAROUSEL_GAP_PX }}>
          <CarouselSpacer width={sidePaddingPx} />
          {slideIds.map((slideId, index) => (
            <div
              key={slideId}
              className={cn(
                "h-full shrink-0 snap-center overflow-hidden rounded-[18px]",
                !isBrowse && "compass-library-panel-top",
              )}
              style={{ width: slideWidthPx }}
            >
              {renderSlide(slideId, index)}
            </div>
          ))}
          <CarouselSpacer width={sidePaddingPx} />
        </div>
      </div>
    </div>
  );
}
