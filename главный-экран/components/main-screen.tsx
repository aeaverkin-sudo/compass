"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BOTTOM_PLATE_LOWER_PX, carouselSidePaddingPx, layoutTop, SHEET_INSET, TOP_VEIL_PX } from "../layout";
import { BottomNav } from "./bottom-nav";
import { useMainLayout } from "../hooks/use-main-layout";
import { isContactFilled } from "@/shared/services/contact-item";
import { getCardItems } from "@/shared/services/card-snapshot";
import { publicCardUrl } from "@/shared/services/public-card-url";
import {
  canAddMoreCards,
  isCardReady,
  useAppStore,
} from "@/shared/store/app-store";
import { CardCarousel } from "./card-carousel";
import { QrZone } from "./qr-zone";

export function MainScreen() {
  const cards = useAppStore((state) => state.cards);
  const currentCardIndex = useAppStore((state) => state.currentCardIndex);
  const contactItems = useAppStore((state) => state.contactItems);
  const setCurrentCardIndex = useAppStore((state) => state.setCurrentCardIndex);
  const updateCard = useAppStore((state) => state.updateCard);
  const updateSecondCardDraft = useAppStore((state) => state.updateSecondCardDraft);
  const emptyFillHintSeen = useAppStore((state) => state.user.emptyFillHintSeen);
  const markEmptyFillHintSeen = useAppStore((state) => state.markEmptyFillHintSeen);
  const [editing, setEditing] = useState(false);
  const [composeOnMount, setComposeOnMount] = useState(false);
  const openAddRef = useRef<(() => void) | null>(null);
  const [composing, setComposing] = useState(false);
  const onComposingChange = useCallback((open: boolean) => setComposing(open), []);

  const shownCard = cards[currentCardIndex] ?? null;
  const cardReady = Boolean(shownCard && isCardReady(shownCard));
  const shownHasBody = Boolean(shownCard && getCardItems(shownCard, contactItems).length > 0);
  const hideNav = cardReady && !shownHasBody;
  const showAddSlide = canAddMoreCards(cards);

  useEffect(() => {
    if (!cards[currentCardIndex]) {
      setEditing(false);
      setComposeOnMount(false);
    }
  }, [cards, currentCardIndex]);

  useEffect(() => {
    const first = cards[0];
    if (!first || emptyFillHintSeen) return;
    const filled = first.contactItemIds.some((id) => {
      const item = contactItems.find((entry) => entry.id === id);
      return Boolean(item && isContactFilled(item));
    });
    if (filled) markEmptyFillHintSeen();
  }, [cards, contactItems, emptyFillHintSeen, markEmptyFillHintSeen]);

  useEffect(() => {
    const blockSelection = (event: Event) => {
      const node = event.target;
      const el = node instanceof Element ? node : node instanceof Node ? node.parentElement : null;
      if (!el?.closest(".compass-main")) return;
      if (el.closest("input, textarea, [contenteditable='true']")) return;
      event.preventDefault();
      window.getSelection()?.removeAllRanges();
    };
    const clearOnPress = (event: Event) => {
      const node = event.target;
      const el = node instanceof Element ? node : node instanceof Node ? node.parentElement : null;
      if (!el?.closest("button, a")) return;
      if (el.closest("input, textarea")) return;
      window.getSelection()?.removeAllRanges();
    };
    document.addEventListener("selectstart", blockSelection, true);
    document.addEventListener("contextmenu", blockSelection, true);
    document.addEventListener("pointerdown", clearOnPress, true);
    return () => {
      document.removeEventListener("selectstart", blockSelection, true);
      document.removeEventListener("contextmenu", blockSelection, true);
      document.removeEventListener("pointerdown", clearOnPress, true);
    };
  }, []);

  const cardUrl = shownCard?.publicToken ? publicCardUrl(shownCard.publicToken) : "";
  const layout = useMainLayout();

  if (cards.length === 0) {
    return <div className="fixed inset-0 bg-background" aria-hidden />;
  }

  const cardTopBrowse = layout?.cardTopBrowse;
  const browseCarousel = cards.length > 1 || showAddSlide;
  const edgeInsetBrowse = layout?.edgeInsetBrowse ?? SHEET_INSET.browse.horizontal;

  return (
    <main className="compass-main fixed inset-0 overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 z-0 bg-background">
        {layout ? (
          <QrZone url={cardUrl} visible={cardReady} topOffsetPx={layout.qrTop} />
        ) : null}
      </div>

      {layout && !composing ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col"
          style={{ top: layoutTop(layout.cardBottomBrowse + BOTTOM_PLATE_LOWER_PX) }}
        >
          <div className="shrink-0 bg-gradient-to-b from-transparent to-sky" style={{ height: TOP_VEIL_PX }} />
          <div className="flex-1 bg-sky" />
        </div>
      ) : null}

      {layout && !composing && (editing || !hideNav) ? (
        <BottomNav
          centerYpx={layout.browseMenuCenterY}
          insetPx={browseCarousel ? carouselSidePaddingPx(window.innerWidth, true) : edgeInsetBrowse}
          editing={editing}
          onEdit={() => {
            if (!cards[currentCardIndex]) updateSecondCardDraft({ displayName: "" });
            setComposeOnMount(false);
            setEditing(true);
          }}
          onAdd={() => openAddRef.current?.()}
          onDone={() => {
            setComposeOnMount(false);
            setEditing(false);
          }}
        />
      ) : null}

      {layout && cardTopBrowse !== undefined ? (
        <div
          className="absolute overflow-hidden"
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
            canAddCard={showAddSlide}
            editing={editing}
            fillHint={!emptyFillHintSeen}
            composeOnMount={composeOnMount}
            openAddRef={openAddRef}
            onComposingChange={onComposingChange}
            onFill={(cardId) => {
              const index = cards.findIndex((card) => card.id === cardId);
              if (index === 0) markEmptyFillHintSeen();
              if (index > 0) setCurrentCardIndex(index);
              setComposeOnMount(!contactItems.some(isContactFilled));
              setEditing(true);
            }}
            onActiveIndexChange={setCurrentCardIndex}
            onUpdateCard={updateCard}
            onEmptyAreaTap={() => undefined}
          />
        </div>
      ) : null}
    </main>
  );
}
