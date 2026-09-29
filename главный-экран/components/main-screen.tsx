"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { useAccountStatus } from "@/shared/hooks/use-account-status";
import { useCardsHydrated } from "@/shared/hooks/use-cards-hydrated";

export function MainScreen() {
  const router = useRouter();
  const cards = useAppStore((state) => state.cards);
  const currentCardIndex = useAppStore((state) => state.currentCardIndex);
  const contactItems = useAppStore((state) => state.contactItems);
  const setCurrentCardIndex = useAppStore((state) => state.setCurrentCardIndex);
  const updateCard = useAppStore((state) => state.updateCard);
  const updateSecondCardDraft = useAppStore((state) => state.updateSecondCardDraft);
  const emptyFillHintSeen = useAppStore((state) => state.user.emptyFillHintSeen);
  const passwordHintSeen = useAppStore((state) => state.user.passwordHintSeen);
  const markEmptyFillHintSeen = useAppStore((state) => state.markEmptyFillHintSeen);
  const markPasswordHintSeen = useAppStore((state) => state.markPasswordHintSeen);
  const [editing, setEditing] = useState(false);
  const [composeOnMount, setComposeOnMount] = useState(false);
  const openAddRef = useRef<(() => void) | null>(null);
  const [composing, setComposing] = useState(false);
  const account = useAccountStatus();
  const cardsHydrated = useCardsHydrated();
  const frozen = account?.frozen === true;
  const needsAccount = account !== null && !account.registered;
  const [gateNonce, setGateNonce] = useState<number | null>(null);
  const [passwordHint, setPasswordHint] = useState(false);
  const clearGate = useCallback(() => setGateNonce(null), []);
  const dismissPasswordHint = useCallback(() => setPasswordHint(false), []);
  const showGate = useCallback(() => setGateNonce(Date.now()), []);
  const onComposingChange = useCallback((open: boolean) => setComposing(open), []);

  const portfolioLimit = account?.portfolioLimit ?? null;
  const showAddSlide = canAddMoreCards(cards, portfolioLimit);
  const [browseIndex, setBrowseIndex] = useState(currentCardIndex);

  useEffect(() => {
    setBrowseIndex((index) => {
      const maxIndex = showAddSlide ? cards.length : Math.max(cards.length - 1, 0);
      return Math.min(index, maxIndex);
    });
  }, [cards.length, showAddSlide]);

  useEffect(() => {
    setBrowseIndex((index) => (index >= cards.length ? index : currentCardIndex));
  }, [currentCardIndex, cards.length]);

  const viewingAddSlide = showAddSlide && browseIndex >= cards.length;
  const browseCard = viewingAddSlide ? null : (cards[browseIndex] ?? cards[currentCardIndex] ?? null);
  const cardReady = Boolean(browseCard && isCardReady(browseCard));
  const shownHasBody = Boolean(browseCard && getCardItems(browseCard, contactItems).length > 0);
  const hideNav =
    (cardReady && !shownHasBody) || (viewingAddSlide && needsAccount);

  useEffect(() => {
    if (!cards[currentCardIndex] || frozen) {
      setEditing(false);
      setComposeOnMount(false);
    }
  }, [cards, currentCardIndex, frozen]);

  useEffect(() => {
    if (composing || passwordHintSeen || passwordHint) return;
    if (!account?.registered || account.provider !== "email") return;
    markPasswordHintSeen();
    setPasswordHint(true);
  }, [account, composing, markPasswordHintSeen, passwordHint, passwordHintSeen]);

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

  const cardUrl = browseCard?.publicToken ? publicCardUrl(browseCard.publicToken) : "";
  const layout = useMainLayout();

  if (cards.length === 0) {
    if (!cardsHydrated) {
      return (
        <main
          className="compass-main fixed inset-0 flex items-center justify-center bg-background"
          aria-busy="true"
        >
          <p className="text-[14px] font-light text-[#111]">…</p>
        </main>
      );
    }
    return (
      <main className="compass-main fixed inset-0 flex flex-col items-center justify-center bg-background px-8 text-center text-[#111]">
        <p className="max-w-xs text-[16px] font-light leading-snug">You don&apos;t have a portfolio yet.</p>
        <button
          type="button"
          className="mt-6 border-0 bg-sky px-6 py-3 text-[13px] font-normal tracking-[0.14em] uppercase disabled:opacity-40"
          disabled={portfolioLimit === null || cards.length >= portfolioLimit}
          onClick={() => {
            if (portfolioLimit === null) return;
            updateSecondCardDraft({ displayName: "" }, portfolioLimit);
          }}
        >
          Create portfolio
        </button>
      </main>
    );
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

      {layout && !composing && (editing || !hideNav) ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-sky"
          style={{ top: layoutTop(layout.cardBottomBrowse + BOTTOM_PLATE_LOWER_PX + TOP_VEIL_PX) }}
        />
      ) : null}

      {frozen && !composing ? (
        <p
          className="absolute inset-x-6 z-30 text-center text-[13px] font-light leading-snug text-[#111]"
          style={{ bottom: "calc(max(1.5rem, env(safe-area-inset-bottom)) + 52px)" }}
        >
          Frozen.{" "}
          <Link href="/register" className="underline">
            Register to restore this portfolio.
          </Link>
        </p>
      ) : null}

      {passwordHint && !composing ? (
        <InfoNotice text="You can change your password in Profile." onDone={dismissPasswordHint} />
      ) : null}

      {gateNonce !== null ? <GateNotice nonce={gateNonce} onDone={clearGate} /> : null}

      {layout && !composing && (editing || !hideNav) ? (
        <BottomNav
          centerYpx={layout.browseMenuCenterY}
          insetPx={browseCarousel ? carouselSidePaddingPx(window.innerWidth, true) : edgeInsetBrowse}
          editing={editing}
          onProfile={() => router.push("/profile")}
          onNetwork={() => {
            if (needsAccount) showGate();
          }}
          onEdit={() => {
            if (frozen) return;
            if (needsAccount && !cards[currentCardIndex]) {
              showGate();
              return;
            }
            if (!cards[currentCardIndex] && portfolioLimit !== null) {
              updateSecondCardDraft({ displayName: "" }, portfolioLimit);
            }
            setComposeOnMount(false);
            setEditing(true);
          }}
          onAdd={() => {
            if (needsAccount && !cards[currentCardIndex]) {
              showGate();
              return;
            }
            openAddRef.current?.();
          }}
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
            activeIndex={browseIndex}
            contactItems={contactItems}
            mode="browse"
            canAddCard={showAddSlide}
            editing={editing}
            fillHint={!emptyFillHintSeen}
            composeOnMount={composeOnMount}
            openAddRef={openAddRef}
            onComposingChange={onComposingChange}
            frozen={frozen}
            shareFootnote={
              account?.trial && !frozen && !composing ? (
                <p className="text-[13px] font-light leading-snug text-[#111]">
                  Trial — {account.hoursLeft}h left.{" "}
                  <Link href="/register" className="underline">
                    Register now
                  </Link>
                </p>
              ) : null
            }
            needsAccount={needsAccount}
            onTrialSlot={() => showGate()}
            onFill={(cardId) => {
              if (frozen) return;
              const index = cards.findIndex((card) => card.id === cardId);
              if (index === 0) markEmptyFillHintSeen();
              if (index > 0) setCurrentCardIndex(index);
              setComposeOnMount(!contactItems.some(isContactFilled));
              setEditing(true);
            }}
            onActiveIndexChange={(index) => {
              setBrowseIndex(index);
              if (index < cards.length) setCurrentCardIndex(index);
            }}
            onUpdateCard={updateCard}
            onEmptyAreaTap={() => undefined}
          />
        </div>
      ) : null}
    </main>
  );
}

function InfoNotice({ text, onDone }: { text: string; onDone: () => void }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const appear = window.requestAnimationFrame(() => setShown(true));
    const fade = window.setTimeout(() => setShown(false), 5000);
    const done = window.setTimeout(onDone, 6200);
    return () => {
      window.cancelAnimationFrame(appear);
      window.clearTimeout(fade);
      window.clearTimeout(done);
    };
  }, [onDone]);

  return (
    <p
      className="pointer-events-none absolute top-1/2 left-1/2 z-40 max-w-[280px] -translate-x-1/2 -translate-y-1/2 bg-sky px-5 py-4 text-center text-[16px] font-normal leading-snug text-[#111] transition-opacity duration-1000 ease-out"
      style={{ opacity: shown ? 1 : 0 }}
    >
      {text}
    </p>
  );
}

function GateNotice({ nonce, onDone }: { nonce: number; onDone: () => void }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    setFading(false);
    const fade = window.setTimeout(() => setFading(true), 4000);
    const done = window.setTimeout(onDone, 5500);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(done);
    };
  }, [nonce, onDone]);

  return (
    <Link
      href="/register"
      className="absolute top-1/2 left-1/2 z-40 max-w-[280px] -translate-x-1/2 -translate-y-1/2 bg-sky px-5 py-4 text-center text-[16px] font-normal leading-snug text-[#111] transition-opacity duration-[1500ms] ease-out"
      style={{ opacity: fading ? 0 : 1 }}
    >
      <span className="underline">Register</span>
      {" to get full access."}
    </Link>
  );
}
