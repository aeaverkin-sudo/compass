"use client";

import { startTransition, useCallback, useDeferredValue, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import { carouselSidePaddingPx, layoutTop, SHEET_INSET } from "../layout";
import { BottomNav } from "./bottom-nav";
import { useMainLayout } from "../hooks/use-main-layout";
import { isContactFilled } from "@/shared/services/contact-item";
import { publicCardUrl } from "@/shared/services/public-card-url";
import {
  canAddMoreCards,
  isCardReady,
  useAppStore,
} from "@/shared/store/app-store";
import { CardCarousel } from "./card-carousel";
import { EventPassFooter } from "./event-pass-footer";
import { QrZone } from "./qr-zone";
import { PortfolioDeleteDialog, useIsFirstCard } from "./portfolio-delete";
import { SideRail } from "./side-rail";
import { useAccountStatus } from "@/shared/hooks/use-account-status";
import { useCardsHydrated } from "@/shared/hooks/use-cards-hydrated";
import { UploadNotice } from "@/shared/components/upload-notice";
import { SkyHint } from "@/shared/components/sky-hint";
import { InstallHint } from "@/shared/components/install-hint";
import type { Card } from "@/shared/types";

const PASS_ADD_HINT = "Complete your pass: add links, your role, socials or a portfolio file.";

/** The rail only needs a card to mount. Row edits keep this same object so the screen around it stays still. */
const railCardCache = new Map<string, Card>();

function railCardOf(cards: Card[], index: number, currentIndex: number) {
  const card = cards[index] ?? cards[currentIndex] ?? null;
  if (!card) return null;
  const cached = railCardCache.get(card.id);
  if (cached) return cached;
  railCardCache.set(card.id, card);
  return card;
}

function ignoreEmptyTap() {}

function CardDeck({
  browseIndex,
  editing,
  showAddSlide,
  fillHint,
  composeOnMount,
  openAddRef,
  onComposingChange,
  frozen,
  needsAccount,
  shareFootnote,
  addNextFor,
  onTrialSlot,
  onFill,
  onActiveIndexChange,
  onUpdateCard,
}: {
  browseIndex: number;
  editing: boolean;
  showAddSlide: boolean;
  fillHint: boolean;
  composeOnMount: boolean;
  openAddRef: RefObject<(() => void) | null>;
  onComposingChange: (open: boolean) => void;
  frozen: boolean;
  needsAccount: boolean;
  shareFootnote: (card: Card) => ReactNode;
  addNextFor: (card: Card) => (() => void) | undefined;
  onTrialSlot: () => void;
  onFill: (cardId: string) => void;
  onActiveIndexChange: (index: number) => void;
  onUpdateCard: (id: string, data: Partial<Card>) => void;
}) {
  const cards = useAppStore((state) => state.cards);
  const contactItems = useAppStore((state) => state.contactItems);
  const faceCards = useDeferredValue(cards);
  const faceItems = useDeferredValue(contactItems);
  return (
    <CardCarousel
      cards={faceCards}
      activeIndex={browseIndex}
      contactItems={faceItems}
      mode="browse"
      canAddCard={showAddSlide}
      editing={editing}
      fillHint={fillHint}
      composeOnMount={composeOnMount}
      openAddRef={openAddRef}
      onComposingChange={onComposingChange}
      frozen={frozen}
      shareFootnote={shareFootnote}
      addNextFor={addNextFor}
      needsAccount={needsAccount}
      onTrialSlot={onTrialSlot}
      onFill={onFill}
      onActiveIndexChange={onActiveIndexChange}
      onUpdateCard={onUpdateCard}
      onEmptyAreaTap={ignoreEmptyTap}
    />
  );
}

export function MainScreen() {
  const router = useRouter();
  const cardCount = useAppStore((state) => state.cards.length);
  const currentCardIndex = useAppStore((state) => state.currentCardIndex);
  const setCurrentCardIndex = useAppStore((state) => state.setCurrentCardIndex);
  const updateCard = useAppStore((state) => state.updateCard);
  const updateSecondCardDraft = useAppStore((state) => state.updateSecondCardDraft);
  const emptyFillHintSeen = useAppStore((state) => state.user.emptyFillHintSeen);
  const passwordHintSeen = useAppStore((state) => state.user.passwordHintSeen);
  const markEmptyFillHintSeen = useAppStore((state) => state.markEmptyFillHintSeen);
  const markPasswordHintSeen = useAppStore((state) => state.markPasswordHintSeen);
  const passAddHintSeen = useAppStore((state) => state.user.passAddHintSeen);
  const markPassAddHintSeen = useAppStore((state) => state.markPassAddHintSeen);
  const [editing, setEditing] = useState(false);
  const [composeOnMount, setComposeOnMount] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const openAddRef = useRef<(() => void) | null>(null);
  const draftStarted = useRef(false);
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

  const frameRef = useRef<HTMLElement>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const portfolioLimit = account?.portfolioLimit ?? null;
  const showAddSlide = useAppStore((state) => canAddMoreCards(state.cards, portfolioLimit));
  const [browseIndex, setBrowseIndex] = useState(currentCardIndex);
  const viewingAddSlide = showAddSlide && browseIndex >= cardCount;
  const activeId = useAppStore((state) => state.cards[state.currentCardIndex]?.id ?? "");
  const editedIsFirst = useIsFirstCard(activeId || undefined);
  const browseId = useAppStore((state) => {
    if (viewingAddSlide) return "";
    return (state.cards[browseIndex] ?? state.cards[state.currentCardIndex])?.id ?? "";
  });
  const nameReady = useAppStore((state) => {
    if (viewingAddSlide) return false;
    const card = state.cards[browseIndex] ?? state.cards[state.currentCardIndex];
    return Boolean(card && isCardReady(card));
  });
  const shownHasBody = useAppStore((state) => {
    if (viewingAddSlide) return false;
    const card = state.cards[browseIndex] ?? state.cards[state.currentCardIndex];
    if (!card) return false;
    return card.contactItemIds.some((id) => {
      const item = state.contactItems.find((entry) => entry.id === id);
      return Boolean(item?.value.trim());
    });
  });
  const cardUrl = useAppStore((state) => {
    if (viewingAddSlide) return "";
    const card = state.cards[browseIndex] ?? state.cards[state.currentCardIndex];
    if (!card?.publicToken) return "";
    return publicCardUrl(card);
  });
  const railCard = useAppStore((state) => (viewingAddSlide ? null : railCardOf(state.cards, browseIndex, state.currentCardIndex)));
  const firstFilled = useAppStore((state) => {
    const first = state.cards[0];
    if (!first) return false;
    return first.contactItemIds.some((id) => {
      const item = state.contactItems.find((entry) => entry.id === id);
      return Boolean(item && isContactFilled(item));
    });
  });

  useEffect(() => {
    setBrowseIndex((index) => {
      const maxIndex = showAddSlide ? cardCount : Math.max(cardCount - 1, 0);
      return Math.min(index, maxIndex);
    });
  }, [cardCount, showAddSlide]);

  useEffect(() => {
    setBrowseIndex((index) => (index >= cardCount ? index : currentCardIndex));
  }, [currentCardIndex, cardCount]);

  const eventPass = account?.eventPass ?? null;
  const passes = new Map((eventPass?.passes ?? []).map((pass) => [pass.cardId, pass]));
  const cardReady = Boolean(browseId && (passes.has(browseId) || nameReady));
  const creatingFirstEmptyCard = !viewingAddSlide && cardCount === 1 && !cardReady;
  const hideNav = (cardReady && !shownHasBody) || creatingFirstEmptyCard;
  const passAddHint = Boolean(
    browseId && passes.has(browseId) && shownHasBody && !passAddHintSeen && !editing && !composing && !passwordHint && !frozen,
  );

  useEffect(() => {
    if (!cardsHydrated || cardCount > 0 || portfolioLimit === null || draftStarted.current) return;
    draftStarted.current = true;
    updateSecondCardDraft({ displayName: "" }, portfolioLimit);
  }, [cardsHydrated, cardCount, portfolioLimit, updateSecondCardDraft]);

  useEffect(() => {
    if (!activeId || frozen) {
      setEditing(false);
      setComposeOnMount(false);
    }
  }, [activeId, frozen]);

  useEffect(() => {
    if (composing || passwordHintSeen || passwordHint) return;
    if (!account?.registered || account.provider !== "email") return;
    markPasswordHintSeen();
    setPasswordHint(true);
  }, [account, composing, markPasswordHintSeen, passwordHint, passwordHintSeen]);

  useEffect(() => {
    if (!firstFilled || emptyFillHintSeen) return;
    markEmptyFillHintSeen();
  }, [firstFilled, emptyFillHintSeen, markEmptyFillHintSeen]);

  useEffect(() => {
    router.prefetch("/profile");
    router.prefetch("/network");
  }, [router]);

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
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) selection.removeAllRanges();
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

  /** Opens the add line inside the tap, so the keyboard comes up in Safari and in-app browsers. */
  const addToPass = useCallback((cardId: string) => {
    markPassAddHintSeen();
    const index = useAppStore.getState().cards.findIndex((entry) => entry.id === cardId);
    flushSync(() => {
      if (index >= 0) setCurrentCardIndex(index);
      setComposeOnMount(false);
      setEditing(true);
    });
    setComposeOnMount(true);
  }, [markPassAddHintSeen, setCurrentCardIndex]);

  const onProfile = useCallback(() => {
    startTransition(() => router.push("/profile"));
  }, [router]);
  const onNetwork = useCallback(() => {
    startTransition(() => router.push("/network"));
  }, [router]);
  const onRemove = useCallback(() => setRemoveOpen(true), []);
  const onDone = useCallback(() => {
    setComposeOnMount(false);
    setEditing(false);
  }, []);
  const onEdit = useCallback(() => {
    if (frozen) return;
    const { cards: liveCards, currentCardIndex: index } = useAppStore.getState();
    if (needsAccount && !liveCards[index]) {
      showGate();
      return;
    }
    if (!liveCards[index] && portfolioLimit !== null) {
      updateSecondCardDraft({ displayName: "" }, portfolioLimit);
    }
    setComposeOnMount(false);
    setEditing(true);
  }, [frozen, needsAccount, portfolioLimit, showGate, updateSecondCardDraft]);
  const onAdd = useCallback(() => {
    const { cards: liveCards, currentCardIndex: index } = useAppStore.getState();
    if (needsAccount && !liveCards[index]) {
      showGate();
      return;
    }
    openAddRef.current?.();
  }, [needsAccount, showGate]);
  const onFill = useCallback((cardId: string) => {
    if (frozen) return;
    const { cards: liveCards, contactItems: liveItems } = useAppStore.getState();
    const index = liveCards.findIndex((card) => card.id === cardId);
    if (index === 0) markEmptyFillHintSeen();
    if (index > 0) setCurrentCardIndex(index);
    setComposeOnMount(!liveItems.some(isContactFilled));
    setEditing(true);
  }, [frozen, markEmptyFillHintSeen, setCurrentCardIndex]);
  const onActiveIndexChange = useCallback((index: number) => {
    setBrowseIndex(index);
    if (index < useAppStore.getState().cards.length) setCurrentCardIndex(index);
  }, [setCurrentCardIndex]);

  const layout = useMainLayout();

  useLayoutEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const sync = () => setFrameWidth(node.clientWidth);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => observer.disconnect();
  }, [cardCount]);

  if (cardCount === 0) {
    return (
      <main
        className="compass-main fixed inset-0 flex items-center justify-center bg-background"
        aria-busy="true"
      >
        <p className="t-meta text-[var(--ink)]">…</p>
      </main>
    );
  }

  const cardTopBrowse = layout?.cardTopBrowse;
  const browseCarousel = cardCount > 1 || showAddSlide;
  const edgeInsetBrowse = layout?.edgeInsetBrowse ?? SHEET_INSET.browse.horizontal;
  const sheetTotal = portfolioLimit !== null && portfolioLimit >= cardCount ? portfolioLimit : cardCount;
  const sheetIndex = Math.min(browseIndex, Math.max(cardCount - 1, 0)) + 1;
  const sideInset = browseCarousel ? carouselSidePaddingPx(frameWidth, true) : edgeInsetBrowse;
  const counterRightCss = `calc(${sideInset}px + clamp(24px, 6.1vw, 28px) - 3mm)`;

  return (
    <main ref={frameRef} className="compass-main fixed inset-x-0 top-0 h-svh overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 z-0 bg-background">
        {layout ? (
            <QrZone url={cardUrl} visible={cardReady && !editing} topOffsetPx={layout.qrTop} scale={layout.headerScale} />
        ) : null}
      </div>

      {layout && cardReady && railCard ? (
        <SideRail
          qrTop={layout.qrTop}
          counterRightCss={counterRightCss}
          card={railCard}
          index={sheetIndex}
          total={sheetTotal}
          showPlus={shownHasBody}
          frozen={frozen}
          editing={editing}
        />
      ) : null}

      {frozen && !composing && !eventPass ? (
        <p
          className="absolute inset-x-6 z-30 text-center t-meta text-[var(--ink)]"
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

      {passAddHint ? <SkyHint text={PASS_ADD_HINT} onDone={markPassAddHintSeen} /> : null}

      {cardReady && shownHasBody ? (
        <InstallHint paused={editing || composing || passAddHint || passwordHint || gateNonce !== null} />
      ) : null}

      {editing && activeId ? (
        <DeleteSlot cardId={activeId} open={removeOpen} onOpenChange={setRemoveOpen} />
      ) : null}

      {gateNonce !== null ? <GateNotice nonce={gateNonce} onDone={clearGate} /> : null}

      <UploadNotice />

      {layout && !composing && (editing || !hideNav) ? (
        <BottomNav
          editing={editing}
          resetsCard={editedIsFirst}
          onRemove={onRemove}
          onProfile={onProfile}
          onNetwork={onNetwork}
          onEdit={onEdit}
          onAdd={onAdd}
          onDone={onDone}
        />
      ) : null}

      {layout && cardTopBrowse !== undefined ? (
        <div
          className="absolute overflow-hidden transition-[top] duration-[460ms] ease-out motion-reduce:transition-none"
          style={{
            left: browseCarousel ? 0 : edgeInsetBrowse,
            right: browseCarousel ? 0 : edgeInsetBrowse,
            top: layoutTop(editing && layout ? layout.qrTop : cardTopBrowse),
            zIndex: 20,
          }}
        >
          <CardDeck
            browseIndex={browseIndex}
            editing={editing}
            showAddSlide={showAddSlide}
            fillHint={!emptyFillHintSeen}
            composeOnMount={composeOnMount}
            openAddRef={openAddRef}
            onComposingChange={onComposingChange}
            frozen={frozen}
            needsAccount={needsAccount}
            shareFootnote={(card) => {
              if (composing) return null;
              const pass = passes.get(card.id);
              if (pass && eventPass) {
                return (
                  <EventPassFooter
                    ended={pass.ended}
                    payPending={pass.payPending}
                    deleteAt={eventPass.deleteAt}
                    needsEmail={eventPass.needsEmail}
                    pendingEmail={eventPass.pendingEmail}
                  />
                );
              }
              return account?.trial && !frozen && !eventPass ? (
                <p className="t-meta text-[var(--ink)]">
                  Trial — {account.hoursLeft}h left.{" "}
                  <Link href="/register" className="underline">
                    Register now
                  </Link>
                </p>
              ) : null;
            }}
            addNextFor={(card) => (passes.has(card.id) && !frozen ? () => addToPass(card.id) : undefined)}
            onTrialSlot={showGate}
            onFill={onFill}
            onActiveIndexChange={onActiveIndexChange}
            onUpdateCard={updateCard}
          />
        </div>
      ) : null}
    </main>
  );
}

function DeleteSlot({
  cardId,
  open,
  onOpenChange,
}: {
  cardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const card = useAppStore((state) => {
    const found = state.cards.find((entry) => entry.id === cardId) ?? null;
    if (!found) return null;
    const cached = railCardCache.get(cardId);
    if (cached) return cached;
    railCardCache.set(cardId, found);
    return found;
  });
  if (!card) return null;
  return <PortfolioDeleteDialog card={card} open={open} onOpenChange={onOpenChange} />;
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
      className="pointer-events-none absolute top-1/2 left-1/2 z-40 max-w-[280px] -translate-x-1/2 -translate-y-1/2 bg-sky px-5 py-4 text-center t-body text-[var(--ink)] transition-opacity duration-1000 ease-out"
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
      className="absolute top-1/2 left-1/2 z-40 max-w-[280px] -translate-x-1/2 -translate-y-1/2 bg-sky px-5 py-4 text-center t-body text-[var(--ink)] transition-opacity duration-[1500ms] ease-out"
      style={{ opacity: fading ? 0 : 1 }}
    >
      <span className="underline">Register</span>
      {" to get full access."}
    </Link>
  );
}
