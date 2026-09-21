"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { carouselSlideWidthPx, layoutTop, SHEET_INSET, type MainScreenMode } from "../layout";
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
  // Guide the user into the fill screen exactly once, on first arrival with a
  // ready card. Card switching / relaunch never forces it (see mainIntroSeen).
  const [mode, setMode] = useState<MainScreenMode>(() => {
    const state = useAppStore.getState();
    const card = selectActiveCard(state.cards, state.currentCardIndex);
    return card && isCardReady(card) && !state.user.mainIntroSeen ? "library" : "browse";
  });
  const [nameEditing, setNameEditing] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [libraryContentWidthPx, setLibraryContentWidthPx] = useState(0);

  const activeCard = useMemo(
    () => selectActiveCard(cards, currentCardIndex),
    [cards, currentCardIndex],
  );
  const cardReady = Boolean(activeCard && isCardReady(activeCard));
  const showAddSlide = canAddMoreCards(cards);

  useShareSync();

  const pdfUrl = useMemo(() => buildPdfUrl(shareToken), [shareToken]);
  const layout = useMainLayout();

  // Persist the one-time intro flag (Zustand action, not React setState).
  useEffect(() => {
    if (mode === "library" && cardReady && !mainIntroSeen) {
      markMainIntroSeen();
    }
  }, [mode, cardReady, mainIntroSeen, markMainIntroSeen]);

  // A card that isn't ready can never show library; keep name-edit stable.
  const effectiveMode: MainScreenMode = cardReady || nameEditing ? mode : "browse";

  const toggleMode = useCallback(() => {
    if (!activeCard || !isCardReady(activeCard)) return;
    setMode((current) => (current === "browse" ? "library" : "browse"));
  }, [activeCard]);

  const edgeInsetBrowse = layout?.edgeInsetBrowse ?? SHEET_INSET.browse.horizontal;
  const edgeInsetLibrary = layout?.edgeInsetLibrary ?? SHEET_INSET.library.horizontal;
  const libraryMultiSlide = cards.length > 1 || showAddSlide;

  useEffect(() => {
    const sync = () => {
      setLibraryContentWidthPx(
        carouselSlideWidthPx(window.innerWidth, libraryMultiSlide, edgeInsetBrowse),
      );
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [libraryMultiSlide, edgeInsetBrowse]);

  if (!activeCard) {
    return <div className="fixed inset-0 bg-background-ready" aria-hidden />;
  }

  const cardTopBrowse = layout?.cardTopBrowse;
  const browseCarousel = effectiveMode === "browse" && (cards.length > 1 || showAddSlide);

  return (
    <main className="compass-main fixed inset-0 overflow-hidden bg-background-ready">
      {/* Layer 0 — permanent background */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-background-ready">
        {layout ? (
          <QrZone url={pdfUrl} visible={cardReady} topOffsetPx={layout.qrTop} />
        ) : null}
      </div>

      {/* Library — preview carousel (full-bleed like browse) + fixed fill panel below */}
      {layout && cardReady && effectiveMode === "library" ? (
        <>
          <div
            className="absolute z-20 overflow-hidden"
            style={{
              left: libraryMultiSlide ? 0 : edgeInsetLibrary,
              right: libraryMultiSlide ? 0 : edgeInsetLibrary,
              top: layoutTop(layout.cardTopLibrary),
              height: layout.libraryCardHeight,
            }}
          >
            {libraryMultiSlide ? (
              <CardCarousel
                cards={cards}
                activeIndex={currentCardIndex}
                contactItems={contactItems}
                mode="library"
                edgeInsetPx={edgeInsetBrowse}
                canAddCard={showAddSlide}
                libraryCardHeightPx={layout.libraryCardHeight}
                onActiveIndexChange={setCurrentCardIndex}
                onUpdateCard={updateCard}
                onEmptyAreaTap={toggleMode}
                onNameEditingChange={setNameEditing}
              />
            ) : (
              <div className="compass-library-panel-top h-full overflow-hidden">
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
            )}
          </div>
          <div
            className="compass-library-stack absolute bottom-0 z-20 flex min-h-0 flex-col"
            style={{
              top: layoutTop(layout.cardTopLibrary + layout.libraryCardHeight + SHEET_INSET.library.gap),
              left: edgeInsetLibrary,
              right: edgeInsetLibrary,
            }}
          >
            <LibraryFillPanel
              card={activeCard}
              panelTopPx={layout.sheetTopLibrary}
              menuCenterYpx={layout.browseMenuCenterY}
              contentWidthPx={libraryContentWidthPx}
              onComposerOpenChange={setComposerOpen}
            />
          </div>
        </>
      ) : null}

      {/* Three dots — fixed in gap below browse card; hidden while composing a row */}
      {layout && cardReady && !composerOpen ? (
        <BrowseMenuButton centerYpx={layout.browseMenuCenterY} mode={effectiveMode} onTap={toggleMode} />
      ) : null}

      {/* Browse — business card(s) */}
      {layout && effectiveMode === "browse" && cardTopBrowse !== undefined ? (
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
