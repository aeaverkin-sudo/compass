"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useAppStore } from "@/shared/store/app-store";
import { uploadAttachment } from "@/shared/services/attachment-upload";
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

const ADD_SLIDE_ID = "__add__";

type CardCarouselProps = {
  cards: Card[];
  activeIndex: number;
  contactItems: ContactItem[];
  mode: MainScreenMode;
  canAddCard: boolean;
  libraryCardHeightPx?: number;
  onActiveIndexChange: (index: number) => void;
  onUpdateCard: (id: string, data: Partial<Card>) => void;
  onEmptyAreaTap: () => void;
  editing?: boolean;
  fillHint?: boolean;
  onFill?: (cardId: string) => void;
  composeOnMount?: boolean;
  /** The visible card's add line. The plate's + calls it inside the tap. */
  openAddRef?: RefObject<(() => void) | null>;
  onComposingChange?: (open: boolean) => void;
};

function CarouselSpacer({ width }: { width: number }) {
  return <div aria-hidden className="shrink-0" style={{ width }} />;
}

const EMPTY_DRAFT: Card = {
  id: ADD_SLIDE_ID,
  displayName: "",
  title: "",
  status: "draft",
  publicToken: "",
  qrVersion: 1,
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
  canAddCard,
  libraryCardHeightPx,
  onActiveIndexChange,
  onUpdateCard,
  onEmptyAreaTap,
  editing = false,
  fillHint = false,
  onFill,
  composeOnMount = false,
  openAddRef,
  onComposingChange,
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

  const slideGapPx = CARD_CAROUSEL_GAP_PX;
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
      const width = isBrowse ? node.clientWidth : document.documentElement.clientWidth;
      setContainerWidth(width);
    };
    sync();

    const observer = new ResizeObserver(sync);
    observer.observe(node);
    window.addEventListener("resize", sync);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [multiSlide, isBrowse]);

  const scrollLeftForIndex = useCallback(
    (index: number) => {
      const node = scrollRef.current;
      if (!node || slideWidthPx === 0) return 0;
      const step = slideWidthPx + slideGapPx;
      return sidePaddingPx + index * step + slideWidthPx / 2 - node.clientWidth / 2;
    },
    [sidePaddingPx, slideGapPx, slideWidthPx],
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
    (data: Partial<Pick<Card, "displayName" | "photo" | "photoAttachmentId">>) => {
      updateSecondCardDraft(data);
    },
    [updateSecondCardDraft],
  );

  const savePickedPhoto = useCallback(
    (cardId: string, photo: string | null, file?: File) => {
      if (!photo || !file) {
        onUpdateCard(cardId, { photo: undefined, photoAttachmentId: undefined });
        return;
      }
      onUpdateCard(cardId, { photo });
      void uploadAttachment({ file, kind: "card-photo", cardId })
        .then((ready) => {
          const current = useAppStore.getState().cards.find((card) => card.id === cardId);
          if (current?.photo !== photo) return;
          onUpdateCard(cardId, { photo: undefined, photoAttachmentId: ready.attachmentId });
        })
        .catch((error: unknown) => {
          console.error("[card-photo]", error);
        });
    },
    [onUpdateCard],
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

  const lockedScroll = useRef<number | null>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (!editing) {
      lockedScroll.current = null;
      return;
    }
    if (!node) return;
    lockedScroll.current = node.scrollLeft;
  }, [editing]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !editing) return;
    let startX = 0;
    let startY = 0;
    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
    };
    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      const dx = Math.abs(touch.clientX - startX);
      const dy = Math.abs(touch.clientY - startY);
      if (dx > dy) event.preventDefault();
    };
    node.addEventListener("touchstart", onStart, { passive: true });
    node.addEventListener("touchmove", onMove, { passive: false });
    return () => {
      node.removeEventListener("touchstart", onStart);
      node.removeEventListener("touchmove", onMove);
    };
  }, [editing, slideWidthPx]);

  const markScrolled = () => {
    scrolledRecently.current = true;
    if (scrollResetTimer.current) clearTimeout(scrollResetTimer.current);
    scrollResetTimer.current = setTimeout(() => {
      scrolledRecently.current = false;
    }, 280);
  };

  const handleScroll = () => {
    const node = scrollRef.current;
    if (!node || syncingScroll.current || !multiSlide || slideWidthPx === 0) return;
    if (editing) {
      const locked = lockedScroll.current;
      if (locked != null && Math.abs(node.scrollLeft - locked) > 1) {
        syncingScroll.current = true;
        node.scrollLeft = locked;
        requestAnimationFrame(() => {
          syncingScroll.current = false;
        });
      }
      return;
    }
    if (node.querySelector("textarea:focus, input:focus")) return;
    const step = slideWidthPx + slideGapPx;
    const viewportCenter = node.scrollLeft + node.clientWidth / 2;

    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < slideIds.length; i++) {
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
    (cardId: string, photo: string | null, file?: File) => {
      savePickedPhoto(cardId, photo, file);
    },
    [savePickedPhoto],
  );

  const renderCard = (
    card: Card,
    onPhoto: (photo: string | null, file?: File) => void,
    onName: (displayName: string) => void,
    onUpdate: (data: Partial<Card>) => void,
    hint: boolean,
  ) => (
    <BusinessCard
      card={card}
      library={contactItems}
      mode={mode}
      libraryCardHeightPx={libraryCardHeightPx}
      onEmptyAreaTap={handleEmptyAreaTap}
      onPhotoChange={onPhoto}
      onDisplayNameChange={onName}
      onCardUpdate={onUpdate}
      editing={editing && card.id !== ADD_SLIDE_ID}
      fillHint={hint}
      onFill={onFill ? () => onFill(card.id) : undefined}
      composeOnMount={composeOnMount && card.id !== ADD_SLIDE_ID && cards[activeIndex]?.id === card.id}
      openAddRef={cards[activeIndex]?.id === card.id ? openAddRef : undefined}
      onComposingChange={cards[activeIndex]?.id === card.id ? onComposingChange : undefined}
    />
  );

  const renderSlide = (slideId: string, index: number) => {
    if (slideId === ADD_SLIDE_ID) {
      const draft = cards[1] ?? EMPTY_DRAFT;
      return renderCard(
        draft,
        (photo, file) => {
          if (!photo || !file) {
            handleDraftUpdate({ photo: undefined, photoAttachmentId: undefined });
            return;
          }
          handleDraftUpdate({ photo });
          const cardId = useAppStore.getState().cards[1]?.id;
          if (!cardId) return;
          savePickedPhoto(cardId, photo, file);
        },
        (displayName) => handleDraftUpdate({ displayName }),
        (data) => {
          if (cards[1]) onUpdateCard(cards[1].id, data);
        },
        false,
      );
    }

    const card = cards[index]!;
    return renderCard(
      card,
      (photo, file) => handlePhotoChange(card.id, photo, file),
      (displayName) => onUpdateCard(card.id, { displayName }),
      (data) => onUpdateCard(card.id, data),
      fillHint && index === 0,
    );
  };

  if (!activeCard) return null;

  if (!multiSlide) {
    return (
      <BusinessCard
        card={activeCard}
        library={contactItems}
        mode={mode}
        libraryCardHeightPx={libraryCardHeightPx}
        onEmptyAreaTap={handleEmptyAreaTap}
        onPhotoChange={(photo, file) => handlePhotoChange(activeCard.id, photo, file)}
        onDisplayNameChange={(displayName) => onUpdateCard(activeCard.id, { displayName })}
        onCardUpdate={(data) => onUpdateCard(activeCard.id, data)}
        editing={editing}
        fillHint={fillHint && activeIndex === 0}
        onFill={onFill ? () => onFill(activeCard.id) : undefined}
        composeOnMount={composeOnMount}
        openAddRef={openAddRef}
        onComposingChange={onComposingChange}
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
    <div className="relative h-full overflow-hidden">
      <div
        ref={scrollRef}
        className={cn(
          "compass-carousel h-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden bg-background",
          isBrowse && "compass-carousel-editorial",
        )}
        onScroll={handleScroll}
      >
        <div className="flex h-full" style={{ gap: slideGapPx }}>
          <CarouselSpacer width={sidePaddingPx} />
          {slideIds.map((slideId, index) => (
            <div
              key={slideId}
              className={cn(
                "compass-carousel-slide h-full shrink-0 snap-center overflow-hidden transition-opacity duration-300",
                !isBrowse && "min-w-0",
                index !== activeIndex && "opacity-50",
                editing && index !== activeIndex && "pointer-events-none",
              )}
              style={
                isBrowse
                  ? { width: slideWidthPx }
                  : { width: slideWidthPx, minWidth: slideWidthPx, maxWidth: slideWidthPx }
              }
            >
              {renderSlide(slideId, index)}
            </div>
          ))}
          <CarouselSpacer width={sidePaddingPx} />
        </div>
      </div>
      {isBrowse ? (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-white to-transparent" />
          <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-white to-transparent" />
        </>
      ) : null}
    </div>
  );
}
