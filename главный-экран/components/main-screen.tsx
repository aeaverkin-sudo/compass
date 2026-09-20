"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { LibraryFillPanel } from "./library-fill-panel";
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
  const updateCard = useAppStore((state) => state.updateCard);
  const mainIntroSeen = useAppStore((state) => state.user.mainIntroSeen);
  const markMainIntroSeen = useAppStore((state) => state.markMainIntroSeen);
  const [mode, setMode] = useState<MainScreenMode>("browse");
  const [nameEditing, setNameEditing] = useState(false);

  const activeCard = useMemo(
    () => selectActiveCard(cards, currentCardIndex),
    [cards, currentCardIndex],
  );
  const cardReady = Boolean(activeCard && isCardReady(activeCard));
  const showAddSlide = canAddMoreCards(cards);

  useShareSync();

  const pdfUrl = useMemo(() => buildPdfUrl(shareToken), [shareToken]);
  const layout = useMainLayout();

  useEffect(() => {
    if (!activeCard || nameEditing) return;

    if (!cardReady) {
      setMode("browse");
      return;
    }

    // Guide the user into the fill screen exactly once — the first time they
    // reach the main screen with a ready card. Card switching never forces it.
    if (!mainIntroSeen) {
      setMode("library");
      markMainIntroSeen();
    }
  }, [activeCard, cardReady, nameEditing, mainIntroSeen, markMainIntroSeen]);

  const toggleMode = useCallback(() => {
    if (!activeCard || !isCardReady(activeCard)) return;
    setMode((current) => (current === "browse" ? "library" : "browse"));
  }, [activeCard]);

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
          <QrZone url={pdfUrl} visible={cardReady} topOffsetPx={layout.qrTop} />
        ) : null}
      </div>

      {/* Library — single stack panel to display edge with unified corners */}
      {layout && cardReady && mode === "library" ? (
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
              onUpdateCard={updateCard}
              onEmptyAreaTap={toggleMode}
              onNameEditingChange={setNameEditing}
            />
          </div>
          <LibraryFillPanel
            card={activeCard}
            panelTopPx={layout.sheetTopLibrary}
            menuCenterYpx={layout.browseMenuCenterY}
          />
        </div>
      ) : null}

      {/* Three dots — fixed in gap below browse card; same spot to enter/exit library */}
      {layout && cardReady ? (
        <BrowseMenuButton centerYpx={layout.browseMenuCenterY} mode={mode} onTap={toggleMode} />
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
            onUpdateCard={updateCard}
            onEmptyAreaTap={toggleMode}
            onNameEditingChange={setNameEditing}
          />
        </div>
      ) : null}
    </main>
  );
}
