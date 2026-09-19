"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { layoutTop, type MainScreenMode } from "../layout";
import { BrowseMenuButton } from "./browse-menu-button";
import { useMainLayout } from "../hooks/use-main-layout";
import { useShareSync } from "../hooks/use-share-sync";
import {
  canAddMoreCards,
  isCardReady,
  selectActiveCard,
  useAppStore,
} from "@/shared/store/app-store";
import { BusinessCard } from "./business-card";
import { CardCarousel } from "./card-carousel";
import { ContentSheetPeek } from "./content-sheet-peek";
import { QrZone } from "./qr-zone";

function buildPdfUrl(token: string) {
  if (typeof window === "undefined") {
    return `/api/share/${token}/pdf`;
  }
  return `${window.location.origin}/api/share/${token}/pdf`;
}

export function MainScreen() {
  const cards = useAppStore((state) => state.cards);
  const currentCardIndex = useAppStore((state) => state.currentCardIndex);
  const contactItems = useAppStore((state) => state.contactItems);
  const shareToken = useAppStore((state) => state.user.shareToken);
  const setCurrentCardIndex = useAppStore((state) => state.setCurrentCardIndex);
  const addCard = useAppStore((state) => state.addCard);
  const updateCard = useAppStore((state) => state.updateCard);
  const [mode, setMode] = useState<MainScreenMode>("browse");

  const compactCardRef = useRef<HTMLElement>(null);
  const [compactCardHeight, setCompactCardHeight] = useState(0);
  const activeCard = useMemo(
    () => selectActiveCard(cards, currentCardIndex),
    [cards, currentCardIndex],
  );
  const showAddSlide = canAddMoreCards(cards);

  useShareSync();

  const pdfUrl = useMemo(() => buildPdfUrl(shareToken), [shareToken]);
  const layout = useMainLayout(compactCardHeight);

  const toggleMode = useCallback(() => {
    setMode((current) => (current === "browse" ? "library" : "browse"));
  }, []);

  const handleAddCard = useCallback(() => {
    addCard();
  }, [addCard]);

  useEffect(() => {
    const compactNode = compactCardRef.current;
    if (!compactNode) return;

    const sync = () => {
      setCompactCardHeight(compactNode.offsetHeight);
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(compactNode);

    return () => observer.disconnect();
  }, [activeCard, contactItems]);

  if (!activeCard) {
    return <div className="fixed inset-0 bg-background-ready" aria-hidden />;
  }

  const cardOnTop = mode === "browse";
  const edgeInset = layout
    ? mode === "browse"
      ? layout.edgeInsetBrowse
      : layout.edgeInsetLibrary
    : 20;
  const cardTop = layout
    ? mode === "browse"
      ? layout.cardTopBrowse
      : layout.cardTopLibrary
    : undefined;
  const browseCarousel = mode === "browse" && (cards.length > 1 || showAddSlide);

  return (
    <main className="compass-main fixed inset-0 overflow-hidden bg-background-ready">
      {/* Off-screen measurer — library compact height only */}
      <div className="pointer-events-none invisible absolute -left-[9999px] top-0" aria-hidden>
        <div style={{ width: layout ? `calc(100vw - ${layout.edgeInsetLibrary * 2}px)` : "calc(100vw - 28px)" }}>
          <BusinessCard
            ref={compactCardRef}
            card={activeCard}
            library={contactItems}
            mode="library"
            onEmptyAreaTap={() => undefined}
          />
        </div>
      </div>

      {/* Layer 0 — permanent background */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-background-ready">
        {layout ? (
          <QrZone url={pdfUrl} visible={isCardReady(activeCard)} topOffsetPx={layout.qrTop} />
        ) : null}
      </div>

      {/* Layer 1 — content sheet (library only for now) */}
      {layout && mode === "library" ? (
        <div className="pointer-events-none absolute inset-0" style={{ zIndex: cardOnTop ? 10 : 30 }}>
          <ContentSheetPeek
            mode={mode}
            edgeInsetPx={layout.edgeInsetLibrary}
            topBrowse={layoutTop(layout.sheetTopBrowse)}
            topLibrary={layoutTop(layout.sheetTopLibrary)}
            onTap={toggleMode}
          />
        </div>
      ) : null}

      {/* Browse menu — centered in gap below card */}
      {layout && mode === "browse" ? (
        <BrowseMenuButton centerYpx={layout.browseMenuCenterY} onTap={toggleMode} />
      ) : null}

      {/* Layer 2 — business card(s) */}
      {layout && cardTop !== undefined ? (
        <div
          className="absolute overflow-hidden transition-[top,left,right] duration-[460ms] ease-out"
          style={{
            left: browseCarousel ? 0 : edgeInset,
            right: browseCarousel ? 0 : edgeInset,
            top: layoutTop(cardTop),
            zIndex: cardOnTop ? 20 : 25,
          }}
        >
          <CardCarousel
            cards={cards}
            activeIndex={currentCardIndex}
            contactItems={contactItems}
            mode={mode}
            edgeInsetPx={edgeInset}
            canAddCard={showAddSlide}
            onActiveIndexChange={setCurrentCardIndex}
            onAddCard={handleAddCard}
            onUpdateCard={updateCard}
            onEmptyAreaTap={toggleMode}
          />
        </div>
      ) : null}
    </main>
  );
}
