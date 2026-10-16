"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import { carouselSidePaddingPx, layoutTop, SHEET_INSET } from "../layout";
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
import { EventPassFooter } from "./event-pass-footer";
import { QrZone } from "./qr-zone";
import { PortfolioDeleteDialog, useIsFirstCard } from "./portfolio-delete";
import { SideRail } from "./side-rail";
import { useAccountStatus } from "@/shared/hooks/use-account-status";
import { useCardsHydrated } from "@/shared/hooks/use-cards-hydrated";
import { UploadNotice } from "@/shared/components/upload-notice";
import { SkyHint } from "@/shared/components/sky-hint";
import { InstallHint } from "@/shared/components/install-hint";

const PASS_ADD_HINT = "Complete your pass: add links, your role, socials or a portfolio file.";

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
  const passAddHintSeen = useAppStore((state) => state.user.passAddHintSeen);
  const markPassAddHintSeen = useAppStore((state) => state.markPassAddHintSeen);
  const [editing, setEditing] = useState(false);
  const [composeOnMount, setComposeOnMount] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const editedIsFirst = useIsFirstCard(cards[currentCardIndex]?.id);
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
  const eventPass = account?.eventPass ?? null;
  const passes = new Map((eventPass?.passes ?? []).map((pass) => [pass.cardId, pass]));
  const cardReady = Boolean(browseCard && (passes.has(browseCard.id) || isCardReady(browseCard)));
  const shownHasBody = Boolean(browseCard && getCardItems(browseCard, contactItems).length > 0);
  const creatingFirstEmptyCard = !viewingAddSlide && cards.length === 1 && !cardReady;
  const hideNav = (cardReady && !shownHasBody) || creatingFirstEmptyCard;
  const passAddHint = Boolean(
    browseCard && passes.has(browseCard.id) && shownHasBody && !passAddHintSeen && !editing && !composing && !passwordHint && !frozen,
  );

  useEffect(() => {
    if (!cardsHydrated || cards.length > 0 || portfolioLimit === null || draftStarted.current) return;
    draftStarted.current = true;
    updateSecondCardDraft({ displayName: "" }, portfolioLimit);
  }, [cardsHydrated, cards.length, portfolioLimit, updateSecondCardDraft]);

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

  /** Opens the add line inside the tap, so the keyboard comes up in Safari and in-app browsers. */
  const addToPass = (cardId: string) => {
    markPassAddHintSeen();
    const index = cards.findIndex((entry) => entry.id === cardId);
    flushSync(() => {
      if (index >= 0) setCurrentCardIndex(index);
      setComposeOnMount(false);
      setEditing(true);
    });
    setComposeOnMount(true);
  };

  const cardUrl = browseCard?.publicToken ? publicCardUrl(browseCard) : "";
  const layout = useMainLayout();

  useLayoutEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const sync = () => setFrameWidth(node.clientWidth);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => observer.disconnect();
  }, [cards.length]);

  if (cards.length === 0) {
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
  const browseCarousel = cards.length > 1 || showAddSlide;
  const edgeInsetBrowse = layout?.edgeInsetBrowse ?? SHEET_INSET.browse.horizontal;
  const sheetTotal = portfolioLimit !== null && portfolioLimit >= cards.length ? portfolioLimit : cards.length;
  const sheetIndex = Math.min(browseIndex, Math.max(cards.length - 1, 0)) + 1;
  const sideInset = browseCarousel ? carouselSidePaddingPx(frameWidth, true) : edgeInsetBrowse;
  const counterRightCss = `calc(${sideInset}px + clamp(24px, 6.1vw, 28px) - 3mm)`;

  return (
    <main ref={frameRef} className="compass-main fixed inset-x-0 top-0 h-svh overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 z-0 bg-background">
        {layout ? (
            <QrZone url={cardUrl} visible={cardReady && !editing} topOffsetPx={layout.qrTop} scale={layout.headerScale} />
        ) : null}
      </div>

      {layout && cardReady && browseCard ? (
        <SideRail
          qrTop={layout.qrTop}
          counterRightCss={counterRightCss}
          card={browseCard}
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

      {editing && cards[currentCardIndex] ? (
        <PortfolioDeleteDialog card={cards[currentCardIndex]} open={removeOpen} onOpenChange={setRemoveOpen} />
      ) : null}

      {gateNonce !== null ? <GateNotice nonce={gateNonce} onDone={clearGate} /> : null}

      <UploadNotice />

      {layout && !composing && (editing || !hideNav) ? (
        <BottomNav
          editing={editing}
          resetsCard={editedIsFirst}
          onRemove={() => setRemoveOpen(true)}
          onProfile={() => router.push("/profile")}
          onNetwork={() => {
            router.push("/network");
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
          className="absolute overflow-hidden transition-[top] duration-[460ms] ease-out motion-reduce:transition-none"
          style={{
            left: browseCarousel ? 0 : edgeInsetBrowse,
            right: browseCarousel ? 0 : edgeInsetBrowse,
            top: layoutTop(editing && layout ? layout.qrTop : cardTopBrowse),
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
