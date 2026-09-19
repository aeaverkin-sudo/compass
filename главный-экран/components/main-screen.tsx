"use client";

import { useCallback, useMemo, useState } from "react";
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
import { CardCarousel } from "./card-carousel";
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

  const activeCard = useMemo(
    () => selectActiveCard(cards, currentCardIndex),
    [cards, currentCardIndex],
  );
  const showAddSlide = canAddMoreCards(cards);

  useShareSync();

  const pdfUrl = useMemo(() => buildPdfUrl(shareToken), [shareToken]);
  const layout = useMainLayout();

  const toggleMode = useCallback(() => {
    setMode((current) => (current === "browse" ? "library" : "browse"));
  }, []);

  const handleAddCard = useCallback(() => {
    addCard();
  }, [addCard]);

  if (!activeCard) {
    return <div className="fixed inset-0 bg-background-ready" aria-hidden />;
  }

  const edgeInsetBrowse = layout?.edgeInsetBrowse ?? 20;
  const cardTopBrowse = layout?.cardTopBrowse;
  const browseCarousel = mode === "browse" && (cards.length > 1 || showAddSlide);

  return (
    <main className="compass-main fixed inset-0 overflow-hidden bg-background-ready">
      {/* Layer 0 — permanent background */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-background-ready">
        {layout ? (
          <QrZone url={pdfUrl} visible={isCardReady(activeCard)} topOffsetPx={layout.qrTop} />
        ) : null}
      </div>

      {/* Library — single stack panel to display edge with unified corners */}
      {layout && mode === "library" ? (
        <div
          className="compass-library-stack absolute inset-x-0 bottom-0 z-20 flex flex-col"
          style={{ top: layoutTop(layout.cardTopLibrary) }}
        >
          <div
            className="compass-library-panel-top shrink-0 overflow-hidden"
            style={{ height: layout.libraryCardHeight }}
          >
            <CardCarousel
              cards={cards}
              activeIndex={currentCardIndex}
              contactItems={contactItems}
              mode="library"
              edgeInsetPx={0}
              canAddCard={showAddSlide}
              libraryCardHeightPx={layout.libraryCardHeight}
              onActiveIndexChange={setCurrentCardIndex}
              onAddCard={handleAddCard}
              onUpdateCard={updateCard}
              onEmptyAreaTap={toggleMode}
            />
          </div>
          <button
            type="button"
            className="compass-library-panel-bottom compass-library-fill min-h-0 flex-1"
            aria-label="Collapse content sheet"
            onClick={toggleMode}
          />
        </div>
      ) : null}

      {/* Browse menu — centered in gap below card */}
      {layout && mode === "browse" ? (
        <BrowseMenuButton centerYpx={layout.browseMenuCenterY} onTap={toggleMode} />
      ) : null}

      {/* Browse — business card(s) */}
      {layout && mode === "browse" && cardTopBrowse !== undefined ? (
        <div
          className="absolute overflow-hidden transition-[top,left,right] duration-[460ms] ease-out"
          style={{
            left: browseCarousel ? 0 : edgeInsetBrowse,
            right: browseCarousel ? 0 : edgeInsetBrowse,
            top: layoutTop(cardTopBrowse),
            zIndex: 20,
          }}
        >
          <CardCarousel
            cards={cards}
            activeIndex={currentCardIndex}
            contactItems={contactItems}
            mode="browse"
            edgeInsetPx={edgeInsetBrowse}
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
