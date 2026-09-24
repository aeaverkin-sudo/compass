"use client";

import { useCallback, useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  carouselSlideWidthPx,
  layoutTop,
  SHEET_INSET,
  type MainScreenMode,
} from "../layout";
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

  const toggleMode = useCallback(() => {
    if (!activeCard) return;
    setMode((current) => {
      if (current === "library") return "browse";
      if (!isCardReady(activeCard)) return current;
      return "library";
    });
  }, [activeCard]);

  const openLibrary = useCallback(() => {
    if (!activeCard || !isCardReady(activeCard)) return;
    setMode("library");
  }, [activeCard]);

  const closeLibrary = useCallback(() => {
    setMode("browse");
  }, []);

  const beginModeSwipe = useCallback(
    (event: ReactPointerEvent<HTMLElement>, direction: "down" | "up") => {
      if (composerOpen) return;
      const target = event.target as HTMLElement;
      if (target.closest("[data-no-swipe], input, textarea")) return;

      const startX = event.clientX;
      const startY = event.clientY;
      const pointerId = event.pointerId;
      const startedAt = performance.now();
      const zone = event.currentTarget.getBoundingClientRect();
      const scroller = target.closest<HTMLElement>(".compass-library-list-scroll, [data-card-chip-list]");
      const scrollTop = scroller?.scrollTop ?? 0;

      const clear = () => {
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", clear);
      };

      function onUp(end: PointerEvent) {
        if (end.pointerId !== pointerId) return;
        clear();
        const elapsed = performance.now() - startedAt;
        if (elapsed > 520) return;
        const dx = end.clientX - startX;
        const dy = end.clientY - startY;
        if (Math.abs(dy) < 52 || Math.abs(dy) < Math.abs(dx) * 1.35) return;
        const scrolled = scroller ? Math.abs(scroller.scrollTop - scrollTop) > 2 : false;
        if (scrolled) return;

        if (direction === "down") {
          if (dy < 0) return;
          // A slow drag on a list that is not at the top stays a scroll. A flick closes.
          if (scroller && scrollTop > 2 && elapsed > 280) return;
          closeLibrary();
        } else {
          if (dy > 0) return;
          if (startY < zone.top + zone.height * 0.4) return;
          const roomBelow = scroller
            ? scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop
            : 0;
          if (roomBelow > 2 && elapsed > 280) return;
          openLibrary();
        }

        const swallowClick = (click: Event) => {
          click.preventDefault();
          click.stopPropagation();
        };
        document.addEventListener("click", swallowClick, true);
        window.setTimeout(() => document.removeEventListener("click", swallowClick, true), 400);
      }

      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", clear);
    },
    [closeLibrary, composerOpen, openLibrary],
  );

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
    return <div className="fixed inset-0 bg-background" aria-hidden />;
  }

  const cardTopBrowse = layout?.cardTopBrowse;
  const browseCarousel = mode === "browse" && (cards.length > 1 || showAddSlide);
  const libraryStackGapPx = SHEET_INSET.library.gap;

  return (
    <main className="compass-main fixed inset-0 overflow-hidden bg-background">
      {/* Layer 0 — permanent background */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-background">
        {layout ? (
          <QrZone url={pdfUrl} visible={cardReady} topOffsetPx={layout.qrTop} />
        ) : null}
      </div>

      {/* Library — preview carousel (full-bleed like browse) + fixed fill panel below */}
      {layout && mode === "library" ? (
        <>
          <div
            className="absolute z-20 overflow-hidden"
            onPointerDown={(event) => beginModeSwipe(event, "down")}
            style={{
              left: libraryMultiSlide ? 0 : edgeInsetBrowse,
              right: libraryMultiSlide ? 0 : edgeInsetBrowse,
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
                />
              </div>
            )}
          </div>
          <div
            className="compass-library-stack absolute bottom-0 z-20 flex min-h-0 flex-col"
            onPointerDown={(event) => beginModeSwipe(event, "down")}
            style={{
              top: layoutTop(layout.cardTopLibrary + layout.libraryCardHeight + libraryStackGapPx),
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

      {/* Mode dots — fixed in gap below browse card; hidden while composing a row */}
      {layout && !composerOpen ? (
        <BrowseMenuButton centerYpx={layout.browseMenuCenterY} mode={mode} onTap={toggleMode} />
      ) : null}

      {/* Browse — business card(s) */}
      {layout && mode === "browse" && cardTopBrowse !== undefined ? (
        <div
          className="absolute overflow-hidden transition-[top,left,right] duration-[460ms] ease-out"
          onPointerDown={(event) => beginModeSwipe(event, "up")}
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
          />
        </div>
      ) : null}
    </main>
  );
}
