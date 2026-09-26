"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { layoutTop, SHEET_INSET } from "../layout";
import { BrowseMenuButton } from "./browse-menu-button";
import { useMainLayout } from "../hooks/use-main-layout";
import { useShareSync } from "../hooks/use-share-sync";
import { isContactFilled } from "@/shared/services/contact-item";
import {
  canAddMoreCards,
  isCardReady,
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
  const updateCard = useAppStore((state) => state.updateCard);
  const updateSecondCardDraft = useAppStore((state) => state.updateSecondCardDraft);
  const emptyFillHintSeen = useAppStore((state) => state.user.emptyFillHintSeen);
  const markEmptyFillHintSeen = useAppStore((state) => state.markEmptyFillHintSeen);
  const [editing, setEditing] = useState(false);
  const [composeOnMount, setComposeOnMount] = useState(false);

  const shownCard = cards[currentCardIndex] ?? null;
  const cardReady = Boolean(shownCard && isCardReady(shownCard));
  const showAddSlide = canAddMoreCards(cards);

  useShareSync();

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

  const pdfUrl = useMemo(() => buildPdfUrl(shareToken), [shareToken]);
  const layout = useMainLayout();
  const [menuCenterY, setMenuCenterY] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!layout) return;
    const measure = () => {
      const viewportH = document.documentElement.clientHeight || window.innerHeight;
      const scrollers = [...document.querySelectorAll(".compass-card-scroll")];
      const scroller =
        scrollers.find((node) => {
          const rect = node.getBoundingClientRect();
          return rect.left < window.innerWidth / 2 && rect.right > window.innerWidth / 2;
        }) ?? scrollers[0];
      if (!(scroller instanceof HTMLElement)) {
        setMenuCenterY(layout.browseMenuCenterY);
        return;
      }
      const rect = scroller.getBoundingClientRect();
      const pad = Number.parseFloat(getComputedStyle(scroller).paddingBottom) || 0;
      const contentBottom = rect.top + scroller.scrollHeight - pad - scroller.scrollTop;
      const fieldTop = Math.min(contentBottom, rect.bottom);
      setMenuCenterY((fieldTop + viewportH) / 2);
    };
    measure();
    const observer = new ResizeObserver(measure);
    document.querySelectorAll(".compass-card-scroll").forEach((node) => observer.observe(node));
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [layout, cards, contactItems, currentCardIndex, editing]);

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
          <QrZone url={pdfUrl} visible={cardReady} topOffsetPx={layout.qrTop} />
        ) : null}
      </div>

      {layout && !editing ? (
        <BrowseMenuButton
          centerYpx={menuCenterY ?? layout.browseMenuCenterY}
          onHold={() => {
            if (!cards[currentCardIndex]) updateSecondCardDraft({ displayName: "" });
            setComposeOnMount(false);
            setEditing(true);
          }}
        />
      ) : null}

      {layout && editing ? (
        <button
          type="button"
          className="absolute left-1/2 z-30 -translate-x-1/2 -translate-y-1/2 px-4 py-2 text-[#111] uppercase"
          style={{
            top: layoutTop(menuCenterY ?? layout.browseMenuCenterY),
            fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
            fontWeight: 600,
            fontSize: 44,
            letterSpacing: "-1px",
            lineHeight: 1,
          }}
          onClick={() => {
            setComposeOnMount(false);
            setEditing(false);
          }}
        >
          OK
        </button>
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
            edgeInsetPx={edgeInsetBrowse}
            canAddCard={showAddSlide}
            editing={editing}
            fillHint={!emptyFillHintSeen}
            composeOnMount={composeOnMount}
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
