"use client";

import { startTransition, useCallback, useDeferredValue, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import {
  BROWSE_QR_SIZE,
  carouselSidePaddingPx,
  HEADER_RHYTHM_PX,
  layoutTop,
  RULE_GAP_PX,
  SCREEN_TOP_AXIS_PX,
  SHEET_INSET,
} from "../layout";
import { cardHasPhoto } from "@/shared/services/card-photo";
import { BottomNav } from "./bottom-nav";
import { useKeyboardVisible } from "../hooks/use-keyboard-dock";
import { useMainLayout } from "../hooks/use-main-layout";
import { isContactFilled } from "@/shared/services/contact-item";
import { groupEditSections } from "@/shared/services/card-zones";
import { publicCardUrl } from "@/shared/services/public-card-url";
import { registeredSession } from "@/shared/lib/session-bootstrap";
import {
  canAddMoreCards,
  isCardReady,
  useAppStore,
} from "@/shared/store/app-store";
import { CardCarousel } from "./card-carousel";
import { EventPassFooter } from "./event-pass-footer";
import { QrZone } from "./qr-zone";
import { PortfolioDeleteDialog } from "./portfolio-delete";
import { PortfolioRenameDialog } from "./portfolio-rename";
import { WalletUpdatePlaque } from "./wallet-update-plaque";
import { useRenamePrompt } from "./use-rename-prompt";
import { RAIL_ICON_SCALE, SideRail } from "./side-rail";
import { MARK_VISIBLE_PX } from "@/shared/components/mark-plus";
import { useAccountStatus } from "@/shared/hooks/use-account-status";
import { useCardsHydrated } from "@/shared/hooks/use-cards-hydrated";
import { editTapBlocked } from "@/shared/lib/card-share-guard";
import { clearFillPlace, readPortfolio, writePortfolio } from "@/shared/lib/fill-place";
import { beginEditHold, commitEditHold, discardEditHold, settleEditHold } from "@/shared/services/edit-hold";
import { flushPendingUpserts } from "@/shared/services/card-sync";
import { flushPendingItemUpserts } from "@/shared/services/card-items-sync";
import { BackButton } from "@/shared/components/back-button";
import { ScreenHeader } from "@/shared/components/screen-header";
import { HEADER_ROW_PX } from "@/shared/layout/axes";
import { UploadNotice } from "@/shared/components/upload-notice";
import { SkyToast } from "@/shared/components/sky-toast";
import { SkyHint } from "@/shared/components/sky-hint";
import { BrowserHandoff } from "@/shared/components/browser-handoff";
import { InstallHint } from "@/shared/components/install-hint";
import type { Card } from "@/shared/types";

const PASS_ADD_HINT = "Complete your pass: add links, role or a file.";
const PHOTO_MISSED_KEY = "aded-photo-missed";
const PHOTO_MISSED = "Photo didn't upload. Try again in Edit.";
const photoMissedListeners = new Set<() => void>();
let photoMissedHeld = false;

function readPhotoMissed() {
  if (photoMissedHeld) return PHOTO_MISSED;
  if (typeof window === "undefined") return null;
  try {
    if (sessionStorage.getItem(PHOTO_MISSED_KEY) !== "1") return null;
    sessionStorage.removeItem(PHOTO_MISSED_KEY);
    photoMissedHeld = true;
    return PHOTO_MISSED;
  } catch {
    return null;
  }
}

function subscribePhotoMissed(listener: () => void) {
  photoMissedListeners.add(listener);
  return () => {
    photoMissedListeners.delete(listener);
  };
}

function clearPhotoMissed() {
  photoMissedHeld = false;
  try {
    sessionStorage.removeItem(PHOTO_MISSED_KEY);
  } catch {
    // The toast is already leaving.
  }
  for (const listener of photoMissedListeners) listener();
}

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

function dropEditHold() {
  const { cards, contactItems } = useAppStore.getState();
  discardEditHold(cards, contactItems, (restored) => useAppStore.setState(restored));
}

function CardDeck({
  browseIndex,
  editing,
  showAddSlide,
  fillHint,
  composeOnMount,
  openZone,
  openAddRef,
  onComposingChange,
  needsAccount,
  shareFootnote,
  addNextFor,
  onTrialSlot,
  onFill,
  onActiveIndexChange,
  onUpdateCard,
  cardLiftPx,
  holdCardLift,
}: {
  browseIndex: number;
  editing: boolean;
  showAddSlide: boolean;
  fillHint: boolean;
  composeOnMount: boolean;
  openZone: string | null;
  openAddRef: RefObject<(() => void) | null>;
  onComposingChange: (open: boolean) => void;
  needsAccount: boolean;
  shareFootnote: (card: Card) => ReactNode;
  addNextFor: (card: Card) => (() => void) | undefined;
  onTrialSlot: () => void;
  onFill: (cardId: string, zoneId?: string) => void;
  onActiveIndexChange: (index: number) => void;
  onUpdateCard: (id: string, data: Partial<Card>) => void;
  /** Real cards sit this far below the raised column, so they stay under the QR. */
  cardLiftPx: number;
  /** Keep that offset mounted while Edit moves the column, so the card does not jump. */
  holdCardLift: boolean;
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
      openZone={openZone}
      openAddRef={openAddRef}
      onComposingChange={onComposingChange}
      shareFootnote={shareFootnote}
      addNextFor={addNextFor}
      needsAccount={needsAccount}
      onTrialSlot={onTrialSlot}
      onFill={onFill}
      onActiveIndexChange={onActiveIndexChange}
      onUpdateCard={onUpdateCard}
      cardLiftPx={cardLiftPx}
      holdCardLift={holdCardLift}
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
  const editingRef = useRef(false);
  const [composeOnMount, setComposeOnMount] = useState(false);
  const [openZone, setOpenZone] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const {
    open: renameOpen,
    askedId: renameCardId,
    plaque: walletPlaque,
    dismissPlaque,
    markWallet: markRenameWallet,
    note: noteRename,
    finishEdit,
    takeSnap,
    revealPlaque,
    apply: applyRename,
    reset: resetRename,
    pending: renamePending,
  } = useRenamePrompt();
  const openAddRef = useRef<(() => void) | null>(null);
  const draftStarted = useRef(false);
  const [composing, setComposing] = useState(false);
  const keyboardUp = useKeyboardVisible();
  const account = useAccountStatus();
  const cardsHydrated = useCardsHydrated();
  const photoMissed = useSyncExternalStore(subscribePhotoMissed, readPhotoMissed, () => null);
  const needsAccount = account !== null && !account.registered;
  const [gateNonce, setGateNonce] = useState<number | null>(null);
  const [passwordHint, setPasswordHint] = useState(false);
  const clearGate = useCallback(() => setGateNonce(null), []);
  const dismissPasswordHint = useCallback(() => setPasswordHint(false), []);
  const showGate = useCallback(() => setGateNonce(Date.now()), []);
  const onComposingChange = useCallback((open: boolean) => setComposing(open), []);
  editingRef.current = editing;

  const rememberEdit = useCallback((cardId: string) => {
    if (!cardId) return;
    const current = readPortfolio();
    const same = current?.cardId === cardId ? current : null;
    writePortfolio({
      cardId,
      rowId: same?.rowId ?? null,
      sectionId: same?.sectionId ?? null,
      rowText: same?.rowText ?? null,
    });
  }, []);

  const noteEditName = useCallback(
    (cardId: string | undefined) => {
      noteRename(cardId, editingRef.current);
      const { cards: liveCards, contactItems: liveItems } = useAppStore.getState();
      beginEditHold(liveCards, liveItems, () => {
        flushPendingUpserts();
        flushPendingItemUpserts();
      });
    },
    [noteRename],
  );

  const frameRef = useRef<HTMLElement>(null);
  const deckFrameRef = useRef<HTMLDivElement>(null);
  const addSlideWasShown = useRef(false);
  const [frameWidth, setFrameWidth] = useState(0);
  const portfolioLimit = account?.portfolioLimit ?? null;
  const showAddSlide = useAppStore((state) => canAddMoreCards(state.cards, portfolioLimit));
  const [browseIndex, setBrowseIndex] = useState(currentCardIndex);
  const viewingAddSlide = showAddSlide && browseIndex >= cardCount;
  const activeId = useAppStore((state) => state.cards[state.currentCardIndex]?.id ?? "");
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
    browseId && passes.has(browseId) && shownHasBody && !passAddHintSeen && !editing && !composing && !passwordHint,
  );

  useEffect(() => {
    if (!cardsHydrated || cardCount > 0 || portfolioLimit === null || draftStarted.current) return;
    if (registeredSession()) return;
    draftStarted.current = true;
    updateSecondCardDraft({ displayName: "" }, portfolioLimit);
  }, [cardsHydrated, cardCount, portfolioLimit, updateSecondCardDraft]);

  useEffect(() => {
    if (!cardsHydrated) return;
    const place = readPortfolio();
    const { cards: liveCards, contactItems: liveItems } = useAppStore.getState();
    const inEdit = liveCards.some((card) => card.id === place?.cardId);
    settleEditHold(inEdit, liveCards, liveItems, (restored) => useAppStore.setState(restored));
    if (!place) return;
    const state = useAppStore.getState();
    const index = state.cards.findIndex((card) => card.id === place.cardId);
    if (index < 0) {
      clearFillPlace();
      return;
    }
    const card = state.cards[index];
    const rowGone = Boolean(place.rowId) && !state.contactItems.some((item) => item.id === place.rowId);
    const sectionGone = Boolean(
      card &&
        !place.rowId &&
        place.sectionId &&
        !groupEditSections(state.contactItems.filter(isContactFilled), card, state.cards).some(
          (section) => section.id === place.sectionId,
        ),
    );
    if (card && (rowGone || sectionGone)) {
      writePortfolio({ cardId: place.cardId, rowId: null, sectionId: null, rowText: null });
    }
    setCurrentCardIndex(index);
    setBrowseIndex(index);
    noteEditName(place.cardId);
    setEditing(true);
  }, [cardsHydrated, noteEditName, setCurrentCardIndex]);

  useEffect(() => {
    if (!cardsHydrated) return;
    if (!activeId) {
      setEditing(false);
      setComposeOnMount(false);
      resetRename();
    }
  }, [activeId, cardsHydrated, resetRename]);

  useEffect(() => {
    if (!editing) dropEditHold();
  }, [editing]);

  useEffect(() => dropEditHold, []);

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
    router.prefetch("/info");
  }, [router]);

  useEffect(() => {
    const leave = () => {
      if (editingRef.current) {
        const { cards, currentCardIndex: index } = useAppStore.getState();
        const cardId = cards[index]?.id;
        if (cardId) {
          const current = readPortfolio();
          const same = current?.cardId === cardId ? current : null;
          writePortfolio({
            cardId,
            rowId: same?.rowId ?? null,
            sectionId: same?.sectionId ?? null,
            rowText: same?.rowText ?? null,
          });
        }
        return;
      }
      setComposeOnMount(false);
      setEditing(false);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") leave();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", leave);
    };
  }, []);

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
    noteEditName(cardId);
    flushSync(() => {
      if (index >= 0) setCurrentCardIndex(index);
      setComposeOnMount(false);
      setEditing(true);
    });
    rememberEdit(cardId);
    setComposeOnMount(true);
  }, [markPassAddHintSeen, noteEditName, rememberEdit, setCurrentCardIndex]);

  const onProfile = useCallback(() => {
    startTransition(() => router.push("/profile"));
  }, [router]);
  const onNetwork = useCallback(() => {
    startTransition(() => router.push("/network"));
  }, [router]);
  const onRemove = useCallback(() => setRemoveOpen(true), []);
  const endEdit = useCallback(() => {
    const { snap, warned } = takeSnap();
    setComposeOnMount(false);
    setOpenZone(null);
    clearFillPlace();
    setEditing(false);
    revealPlaque(snap, warned);
  }, [revealPlaque, takeSnap]);
  const onDone = useCallback(() => {
    const { cards: liveCards, contactItems: liveItems } = useAppStore.getState();
    commitEditHold(liveCards, liveItems);
    finishEdit(endEdit);
  }, [endEdit, finishEdit]);
  const leaveEdit = useCallback(() => {
    dropEditHold();
    setComposing(false);
    setRemoveOpen(false);
    endEdit();
  }, [endEdit]);
  const onEdit = useCallback(() => {
    if (editTapBlocked() || renamePending()) return;
    const { cards: liveCards, currentCardIndex: index } = useAppStore.getState();
    if (needsAccount && !liveCards[index]) {
      showGate();
      return;
    }
    if (!liveCards[index] && portfolioLimit !== null) {
      updateSecondCardDraft({ displayName: "" }, portfolioLimit);
    }
    const cardId = useAppStore.getState().cards[useAppStore.getState().currentCardIndex]?.id;
    noteEditName(cardId);
    setComposeOnMount(false);
    setOpenZone(null);
    setEditing(true);
    if (cardId) rememberEdit(cardId);
  }, [needsAccount, noteEditName, portfolioLimit, rememberEdit, renamePending, showGate, updateSecondCardDraft]);
  const onAdd = useCallback(() => {
    const { cards: liveCards, currentCardIndex: index } = useAppStore.getState();
    if (needsAccount && !liveCards[index]) {
      showGate();
      return;
    }
    openAddRef.current?.();
  }, [needsAccount, showGate]);
  const onFill = useCallback((cardId: string, zoneId?: string) => {
    const { cards: liveCards, contactItems: liveItems } = useAppStore.getState();
    const index = liveCards.findIndex((card) => card.id === cardId);
    if (index === 0) markEmptyFillHintSeen();
    if (index > 0) setCurrentCardIndex(index);
    if (zoneId) {
      setComposeOnMount(false);
      setOpenZone(zoneId);
    } else {
      setOpenZone(null);
      setComposeOnMount(!liveItems.some(isContactFilled));
    }
    noteEditName(cardId);
    setEditing(true);
    rememberEdit(cardId);
  }, [markEmptyFillHintSeen, noteEditName, rememberEdit, setCurrentCardIndex]);
  const onActiveIndexChange = useCallback((index: number) => {
    setBrowseIndex(index);
    if (index < useAppStore.getState().cards.length) setCurrentCardIndex(index);
  }, [setCurrentCardIndex]);
  const onSheetCount = useCallback(() => {
    if (editing) return;
    const count = useAppStore.getState().cards.length;
    const last = showAddSlide ? count : Math.max(count - 1, 0);
    const next = browseIndex >= last ? 0 : browseIndex + 1;
    onActiveIndexChange(next);
  }, [browseIndex, editing, onActiveIndexChange, showAddSlide]);

  const columnRef = useRef<HTMLDivElement>(null);
  const [columnH, setColumnH] = useState(0);
  const layout = useMainLayout(cardCount === 0 ? undefined : columnH > 0 ? columnH : null);

  useLayoutEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const sync = () => setFrameWidth(node.clientWidth);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => observer.disconnect();
  }, [cardCount]);

  useLayoutEffect(() => {
    if (addSlideWasShown.current === showAddSlide) return;
    addSlideWasShown.current = showAddSlide;
    const node = deckFrameRef.current;
    if (!node) return;
    // The column jumps up by the QR slot once. A transition would drag the card with it.
    node.style.transition = "none";
    void node.offsetHeight;
    node.style.transition = "";
  }, [showAddSlide]);

  useLayoutEffect(() => {
    const node = columnRef.current;
    if (!node) return;
    const sync = () => {
      const next = node.clientHeight;
      setColumnH((prev) => (prev === next ? prev : next));
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    window.addEventListener("orientationchange", sync);
    return () => {
      observer.disconnect();
      window.removeEventListener("orientationchange", sync);
    };
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
  // Photo on /create sits at S + 54. The new slide uses that line. Real cards keep
  // their place under the QR by the same amount, so a swipe does not move them.
  const addLiftPx =
    showAddSlide && layout
      ? Math.max(
          0,
          (HEADER_RHYTHM_PX + BROWSE_QR_SIZE + RULE_GAP_PX) * layout.headerScale -
            (SCREEN_TOP_AXIS_PX + HEADER_ROW_PX / 2 + 18),
        )
      : 0;
  const cardLiftPx = editing ? 0 : addLiftPx;
  const browseCarousel = cardCount > 1 || showAddSlide;
  // The plan limit arrives after the first paint. A filled card keeps the carousel
  // column while that answer is still out, so the sheet does not slide into center.
  const lastCard = useAppStore.getState().cards[cardCount - 1];
  const holdCarouselFrame =
    account === null && cardCount === 1 && Boolean(lastCard && (cardHasPhoto(lastCard) || lastCard.displayName.trim()));
  const edgeInsetBrowse = layout?.edgeInsetBrowse ?? SHEET_INSET.browse.horizontal;
  const frameInset = browseCarousel
    ? 0
    : holdCarouselFrame
      ? carouselSidePaddingPx(frameWidth || 1, true)
      : edgeInsetBrowse;
  const sheetTotal = portfolioLimit !== null && portfolioLimit >= cardCount ? portfolioLimit : cardCount;
  const sheetIndex = Math.min(browseIndex, Math.max(cardCount - 1, 0)) + 1;
  const sideInset = browseCarousel || holdCarouselFrame ? carouselSidePaddingPx(frameWidth || 1, true) : edgeInsetBrowse;
  const counterRightCss = `calc(${sideInset}px + clamp(24px, 6.1vw, 28px) - 3mm)`;

  return (
    <main ref={frameRef} className="compass-main fixed inset-x-0 top-0 flex h-svh flex-col overflow-hidden bg-background">
      {editing ? (
        <ScreenHeader title="Edit" fallbackHref="/main" onBack={leaveEdit} spacer={false} />
      ) : viewingAddSlide ? (
        <BackButton
          fallbackHref="/main"
          onBack={() => onActiveIndexChange(Math.max(cardCount - 1, 0))}
        />
      ) : null}
      <div ref={columnRef} className="relative min-h-0 flex-1">
      <div className="pointer-events-none absolute inset-0 z-0 bg-background">
        {layout ? (
            <QrZone url={cardUrl} visible={cardReady && !editing} topOffsetPx={layout.qrTop} scale={layout.headerScale} />
        ) : null}
      </div>
      {layout && cardReady && !editing ? (
        <button
          type="button"
          aria-label="Info"
          onClick={() => router.push("/info")}
          className="absolute z-30 -translate-x-1/2 border-0 bg-transparent p-0 text-[var(--ink)]"
          style={{ top: layoutTop(layout.qrTop), left: counterRightCss }}
        >
          <span
            className="block text-center leading-none"
            style={{
              fontSize: (MARK_VISIBLE_PX * RAIL_ICON_SCALE) / 0.714,
              fontWeight: 400,
              textTransform: "none",
              clipPath: "inset(0 0 0.18em 0)",
            }}
          >
            i
          </span>
          <span aria-hidden className="absolute top-1/2 left-1/2 size-11 -translate-x-1/2 -translate-y-1/2" />
        </button>
      ) : null}

      {layout && cardReady && railCard ? (
        <SideRail
          qrTop={layout.qrTop}
          counterRightCss={counterRightCss}
          card={railCard}
          index={sheetIndex}
          total={sheetTotal}
          showPlus={shownHasBody}
          editing={editing}
          onCount={onSheetCount}
        />
      ) : null}

      {passwordHint && !composing ? (
        <InfoNotice text="You can change your password in Profile." onDone={dismissPasswordHint} />
      ) : null}

      {passAddHint ? <SkyHint text={PASS_ADD_HINT} onDone={markPassAddHintSeen} /> : null}

      {cardReady && shownHasBody ? (
        <InstallHint paused={editing || composing || passAddHint || passwordHint || gateNonce !== null} />
      ) : null}
      <BrowserHandoff
        paused={editing || composing || passAddHint || passwordHint || gateNonce !== null}
        registered={account?.registered === true}
      />

      {editing && activeId ? (
        <DeleteSlot cardId={activeId} open={removeOpen} onOpenChange={setRemoveOpen} />
      ) : null}
      {renameOpen && renameCardId ? (
        <PortfolioRenameDialog
          cardId={renameCardId}
          open={renameOpen}
          onYes={() => applyRename(true)}
          onNo={() => applyRename(false)}
          onWalletLine={markRenameWallet}
        />
      ) : null}

      {gateNonce !== null ? <GateNotice nonce={gateNonce} onDone={clearGate} /> : null}

      <UploadNotice />
      {photoMissed ? <SkyToast text={photoMissed} onDone={clearPhotoMissed} /> : null}
      {walletPlaque ? <WalletUpdatePlaque onDone={dismissPlaque} /> : null}

      {layout && cardTopBrowse !== undefined ? (
        <div
          ref={deckFrameRef}
          className="absolute overflow-hidden transition-[top] duration-[460ms] ease-out motion-reduce:transition-none"
          style={{
            left: frameInset,
            right: frameInset,
            top: layoutTop(
              editing && layout ? layout.qrTop + HEADER_ROW_PX / 2 + 18 : cardTopBrowse - cardLiftPx,
            ),
            bottom: 0,
            zIndex: 20,
          }}
        >
          <CardDeck
            browseIndex={browseIndex}
            editing={editing}
            showAddSlide={showAddSlide}
            fillHint={!emptyFillHintSeen}
            composeOnMount={composeOnMount}
            openZone={openZone}
            openAddRef={openAddRef}
            onComposingChange={onComposingChange}
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
              return null;
            }}
            addNextFor={(card) => (passes.has(card.id) ? () => addToPass(card.id) : undefined)}
            onTrialSlot={showGate}
            onFill={onFill}
            onActiveIndexChange={onActiveIndexChange}
            onUpdateCard={updateCard}
            cardLiftPx={cardLiftPx}
            holdCardLift={showAddSlide}
          />
        </div>
      ) : null}
      </div>
      {layout && !composing && !keyboardUp && (editing || !hideNav) ? (
        <BottomNav
          editing={editing}
          onRemove={onRemove}
          onProfile={onProfile}
          onNetwork={onNetwork}
          onEdit={onEdit}
          onAdd={onAdd}
          onDone={onDone}
        />
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
