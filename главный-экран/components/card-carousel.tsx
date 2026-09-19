"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import type { Card, ContactItem } from "@/shared/types";
import {
  browseCardHeight,
  CARD_CAROUSEL_GAP_PX,
  carouselSidePaddingPx,
  carouselSlideWidthPx,
  type MainScreenMode,
} from "../layout";
import { BusinessCard } from "./business-card";

const ADD_SLIDE_ID = "__add__";

type CardCarouselProps = {
  cards: Card[];
  activeIndex: number;
  contactItems: ContactItem[];
  mode: MainScreenMode;
  edgeInsetPx: number;
  canAddCard: boolean;
  onActiveIndexChange: (index: number) => void;
  onAddCard: () => void;
  onEmptyAreaTap: () => void;
};

function AddCardSlide({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      type="button"
      aria-label="Добавить визитку"
      onClick={onAdd}
      className={cn(
        "compass-card flex w-full flex-col items-center justify-center gap-3",
        "overflow-hidden border border-dashed border-hairline/50 bg-sheet text-hint transition-opacity active:opacity-70",
      )}
      style={{ height: browseCardHeight(), paddingTop: 19 }}
    >
      <span className="flex size-14 items-center justify-center rounded-full border border-hairline/60">
        <Plus className="size-7" strokeWidth={1.5} aria-hidden />
      </span>
      <span className="text-[13px] leading-none">ещё одна</span>
    </button>
  );
}

function CarouselSpacer({ width }: { width: number }) {
  return <div aria-hidden className="shrink-0" style={{ width }} />;
}

export function CardCarousel({
  cards,
  activeIndex,
  contactItems,
  mode,
  edgeInsetPx,
  canAddCard,
  onActiveIndexChange,
  onAddCard,
  onEmptyAreaTap,
}: CardCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const syncingScroll = useRef(false);
  const scrolledRecently = useRef(false);
  const scrollResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isBrowse = mode === "browse";
  const multiSlide = isBrowse && (cards.length > 1 || canAddCard);
  const activeCard = cards[activeIndex] ?? cards[0];

  const slideIds = useMemo(() => {
    const ids = cards.map((card) => card.id);
    if (isBrowse && canAddCard) ids.push(ADD_SLIDE_ID);
    return ids;
  }, [cards, isBrowse, canAddCard]);

  const slideWidth = useCallback(() => {
    if (typeof window === "undefined") return 0;
    return carouselSlideWidthPx(window.innerWidth, multiSlide, edgeInsetPx);
  }, [edgeInsetPx, multiSlide]);

  const sidePadding = useCallback(() => {
    if (typeof window === "undefined") return 0;
    return carouselSidePaddingPx(window.innerWidth, multiSlide, edgeInsetPx);
  }, [edgeInsetPx, multiSlide]);

  const scrollLeftForIndex = useCallback(
    (index: number) => {
      const node = scrollRef.current;
      if (!node) return 0;
      const pad = sidePadding();
      const width = slideWidth();
      const step = width + CARD_CAROUSEL_GAP_PX;
      return pad + index * step + width / 2 - node.clientWidth / 2;
    },
    [sidePadding, slideWidth],
  );

  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = "smooth") => {
      const node = scrollRef.current;
      if (!node || !multiSlide) return;
      node.scrollTo({ left: scrollLeftForIndex(index), behavior });
    },
    [multiSlide, scrollLeftForIndex],
  );

  useEffect(() => {
    if (!multiSlide) return;
    syncingScroll.current = true;
    scrollToIndex(activeIndex, "auto");
    requestAnimationFrame(() => {
      syncingScroll.current = false;
    });
  }, [activeIndex, multiSlide, scrollToIndex]);

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
    }, 320);
  };

  const handleScroll = () => {
    if (syncingScroll.current || !scrollRef.current || !multiSlide) return;

    const node = scrollRef.current;
    const pad = sidePadding();
    const width = slideWidth();
    const step = width + CARD_CAROUSEL_GAP_PX;
    const viewportCenter = node.scrollLeft + node.clientWidth / 2;

    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < cards.length; i++) {
      const slideCenter = pad + i * step + width / 2;
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

  if (!activeCard) return null;

  if (!multiSlide) {
    return (
      <BusinessCard
        card={activeCard}
        library={contactItems}
        mode={mode}
        onEmptyAreaTap={handleEmptyAreaTap}
      />
    );
  }

  const width = slideWidth();
  const padding = sidePadding();

  return (
    <div className="overflow-hidden">
      <div
        ref={scrollRef}
        className="compass-carousel snap-x snap-mandatory overflow-x-auto overflow-y-hidden bg-background-ready"
        onScroll={handleScroll}
      >
        <div className="flex" style={{ gap: CARD_CAROUSEL_GAP_PX }}>
          <CarouselSpacer width={padding} />
          {slideIds.map((slideId, index) => (
            <div
              key={slideId}
              className="shrink-0 snap-center overflow-hidden rounded-[18px]"
              style={{ width }}
            >
              {slideId === ADD_SLIDE_ID ? (
                <AddCardSlide onAdd={onAddCard} />
              ) : (
                <BusinessCard
                  card={cards[index]!}
                  library={contactItems}
                  mode={mode}
                  onEmptyAreaTap={handleEmptyAreaTap}
                />
              )}
            </div>
          ))}
          <CarouselSpacer width={padding} />
        </div>
      </div>
    </div>
  );
}
