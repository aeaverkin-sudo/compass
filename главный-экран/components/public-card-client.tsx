"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { DeliveredNote } from "@/shared/services/notes-types";
import {
  peekPublicCardPdf,
  primePublicCardPdf,
  shareCardPdfIfReady,
  type CardPdfInput,
} from "@/shared/services/save-public-card-pdf";
import { AccountBand } from "@/shared/components/account-band";
import { BackButton } from "@/shared/components/back-button";
import { CardPdfSource } from "@/shared/components/card-pdf-source";
import { PortfolioFace, type PortfolioFaceData } from "@/shared/components/portfolio-face";
import { SkyToast } from "@/shared/components/sky-toast";
import { COLUMN_GAP_PX } from "@/shared/layout/axes";
import { useAppStore } from "@/shared/store/app-store";
import { BusinessCard } from "@main/components/business-card";
import { browseBandHeightCss } from "@main/layout";
import type { Card, ContactItem } from "@/shared/types";

type PublicCardClientProps = {
  card: Card;
  items: ContactItem[];
  publicToken: string;
  /** Opened from Network. Same card, back to the list, no sky plaque. */
  inside?: boolean;
  /** In-app scan. One Save, then the person stays on this card. */
  save?: boolean;
  /** The owner deleted the profile. The book's copy, read only. */
  deleted?: boolean;
  /** Where back leads instead of Network, e.g. the event's going list. */
  backHref?: string;
};

type SaveState = "loading" | "ready" | "saved" | "own" | "busy";

function scheduleIdle(run: () => void): () => void {
  const win = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof win.requestIdleCallback === "function") {
    const id = win.requestIdleCallback(run, { timeout: 2500 });
    return () => win.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(run, 1500);
  return () => window.clearTimeout(id);
}

/**
 * SSR shows the card with empty notes. A browser then asks once for delivery.
 * Crawlers without JS leave the pending row alone.
 * Notes ride along once delivered. The received card has no share control.
 */
export function PublicCardClient({
  card,
  items,
  publicToken,
  inside = false,
  save = false,
  deleted = false,
  backHref,
}: PublicCardClientProps) {
  const router = useRouter();
  const [notes, setNotes] = useState<DeliveredNote[]>([]);
  const [notesReady, setNotesReady] = useState(false);
  const [offerOpen, setOfferOpen] = useState(true);
  const [held, setHeld] = useState(inside);
  const [plaqueHeight, setPlaqueHeight] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>(save ? "loading" : "ready");
  const [notice, setNotice] = useState<string | null>(null);
  const [paintPdf, setPaintPdf] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [savePdfDoor, setSavePdfDoor] = useState(false);
  const [shareBack, setShareBack] = useState<{ cards: PortfolioFaceData[]; busy: boolean } | null>(null);
  const plaqueRef = useRef<HTMLDivElement>(null);
  const waitingRef = useRef(false);

  useEffect(() => {
    if (deleted) return;
    let cancelled = false;
    void Promise.all([
      fetch(`/api/c/${encodeURIComponent(publicToken)}/notes`, { method: "POST" }),
      inside && !save ? Promise.resolve(null) : fetch("/api/connections", { cache: "no-store" }),
    ])
      .then(async ([notesResponse, bookResponse]) => {
        if (cancelled) return;
        let owner = false;
        if (notesResponse.ok) {
          const body = (await notesResponse.json()) as { notes?: DeliveredNote[]; owner?: boolean };
          owner = body.owner === true;
          if (Array.isArray(body.notes) && body.notes.length > 0) setNotes(body.notes);
        }
        let saved = false;
        if (bookResponse?.ok) {
          const book = (await bookResponse.json()) as { connections?: { savedCardToken?: string }[] };
          const rows = Array.isArray(book.connections) ? book.connections : [];
          saved = rows.some((row) => row.savedCardToken === publicToken || row.savedCardToken === card.publicToken);
        }
        if (!inside) setHeld(owner || saved);
        if (save) setSaveState(owner ? "own" : saved ? "saved" : "ready");
      })
      .catch(() => {
        if (save) setSaveState((state) => (state === "loading" ? "ready" : state));
      })
      .finally(() => {
        if (!cancelled) setNotesReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [deleted, inside, save, publicToken, card.publicToken]);

  const pdfInput = (): CardPdfInput => ({
    cardId: card.id,
    publicToken,
    displayName: card.displayName,
    notes,
  });

  const offer = !inside && notesReady && !held && offerOpen;

  useLayoutEffect(() => {
    const node = plaqueRef.current;
    if (!offer || !node) {
      setPlaqueHeight(0);
      return;
    }
    const apply = () => setPlaqueHeight(node.offsetHeight);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, [offer]);

  /** After first paint / idle: build the PDF so the first Get PDF tap can share sync. */
  useEffect(() => {
    if (inside || !notesReady) return;
    let cancelled = false;
    const cancelIdle = scheduleIdle(() => {
      if (cancelled) return;
      setPaintPdf(true);
      void primePublicCardPdf({
        cardId: card.id,
        publicToken,
        displayName: card.displayName,
        notes,
      }).catch(() => undefined);
    });
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [inside, notesReady, card.id, card.displayName, publicToken, notes]);

  const openSavePdfDoor = () => {
    setPreparing(false);
    setNotice(null);
    setSavePdfDoor(true);
  };

  const preparePdf = () => {
    setPaintPdf(true);
    void primePublicCardPdf(pdfInput()).catch(() => undefined);
  };

  /** Must stay sync until `navigator.share` — no await before the handoff. */
  const onPdfTap = () => {
    const input = pdfInput();
    preparePdf();
    if (shareCardPdfIfReady(input, { onShareFailed: openSavePdfDoor })) {
      setPreparing(false);
      setSavePdfDoor(false);
      return;
    }
    setSavePdfDoor(false);
    setPreparing(true);
    if (waitingRef.current) return;
    waitingRef.current = true;
    void primePublicCardPdf(input)
      .then(() => {
        waitingRef.current = false;
        if (peekPublicCardPdf(input)) openSavePdfDoor();
        else setPreparing(false);
      })
      .catch(() => {
        waitingRef.current = false;
        setPreparing(false);
      });
  };

  const onSavePdfDoorTap = () => {
    const input = pdfInput();
    if (shareCardPdfIfReady(input, { onShareFailed: openSavePdfDoor })) {
      setSavePdfDoor(false);
    }
  };

  const savePdf = () => {
    setOfferOpen(false);
    onPdfTap();
  };

  const keep = async () => {
    if (saveState !== "ready") return;
    setSaveState("busy");
    try {
      const response = await fetch("/api/network/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: publicToken }),
      });
      if (response.status === 401) {
        const next = `/scan/card?token=${encodeURIComponent(publicToken)}`;
        router.push(`/register?signin=1&next=${encodeURIComponent(next)}`);
        setSaveState("ready");
        return;
      }
      if (response.status === 409) {
        setSaveState("own");
        return;
      }
      if (!response.ok) {
        setSaveState("ready");
        return;
      }
      setSaveState("saved");
      setNotice("Saved to your network");
      void offerShareBack();
    } catch {
      setSaveState("ready");
    }
  };

  const offerShareBack = async () => {
    if (offeredBefore(publicToken)) return;
    markOffered(publicToken);
    let primaryId: string | null = null;
    try {
      const response = await fetch("/api/cards/primary", { cache: "no-store" });
      if (response.ok) primaryId = ((await response.json()) as { cardId?: string | null }).cardId ?? null;
    } catch {
      /* the first named card leads */
    }
    const cards = shareBackCards(primaryId);
    if (cards.length > 0) setShareBack({ cards, busy: false });
  };

  const sendShareBack = async (cardId: string) => {
    if (shareBack?.busy) return;
    setShareBack((current) => (current ? { ...current, busy: true } : current));
    try {
      await fetch("/api/connections/share-back", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromCardId: cardId, toCardToken: publicToken }),
      });
    } catch {
      /* no receipts either way */
    }
    setShareBack(null);
  };

  const sheet = (
    <BusinessCard
      card={card}
      library={items}
      mode="browse"
      readOnly
      deliveredNotes={notes}
    />
  );

  const pdfSheets = paintPdf ? (
    <CardPdfSource
      key={`${publicToken}:${notes.map((note) => `${note.id}:${note.content}`).join("|")}`}
      input={pdfInput()}
      epoch={0}
    >
      {(mask) => (
        <BusinessCard pdf pdfMask={mask} readOnly card={card} library={items} mode="browse" deliveredNotes={notes} />
      )}
    </CardPdfSource>
  ) : null;

  if (inside) {
    return (
      <div className="bg-white pt-[84px]" style={{ "--card-frame-top": "84px" } as CSSProperties}>
        {notice ? <SkyToast key={notice} text={notice} onDone={() => setNotice(null)} /> : null}
        <BackButton
          fallbackHref={backHref ?? "/network"}
          onBack={save ? () => router.push(backHref ?? "/network") : undefined}
        />
        {sheet}
        {deleted ? <SaveBar state="deleted" onSave={() => undefined} /> : null}
        {save && !deleted && shareBack ? (
          <ShareBack
            cards={shareBack.cards}
            busy={shareBack.busy}
            onSend={(cardId) => void sendShareBack(cardId)}
            onDismiss={() => setShareBack((current) => (current?.busy ? current : null))}
          />
        ) : save && !deleted ? (
          <SaveBar state={saveState} onSave={() => void keep()} />
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="compass-main fixed inset-x-0 top-0 flex h-svh flex-col overflow-hidden bg-white"
      style={{ "--card-frame-top": `${plaqueHeight}px` } as CSSProperties}
    >
      {notice ? <SkyToast key={notice} text={notice} onDone={() => setNotice(null)} /> : null}
      {preparing ? (
        <p className="pointer-events-none fixed top-1/2 left-1/2 z-40 max-w-[280px] -translate-x-1/2 -translate-y-1/2 bg-sky px-5 py-4 text-center t-body text-[var(--ink)]">
          Preparing PDF…
        </p>
      ) : null}
      {savePdfDoor ? (
        <div className="fixed top-1/2 left-1/2 z-40 max-w-[280px] -translate-x-1/2 -translate-y-1/2 bg-sky px-5 py-4 text-center">
          <button
            type="button"
            className="t-caps text-[var(--ink)] outline-none"
            onClick={onSavePdfDoorTap}
          >
            SAVE PDF
          </button>
        </div>
      ) : null}
      {pdfSheets}
      {offer ? (
        <div
          ref={plaqueRef}
          className="t-band shrink-0 bg-sky px-5 py-4 text-center text-[var(--ink)]"
          style={{
            paddingTop: "calc(env(safe-area-inset-top) + 16px)",
          }}
        >
          <p>Save this portfolio as a PDF</p>
          <div className="mt-3 flex items-baseline justify-center gap-6">
            <button
              type="button"
              className="t-band px-2 py-2"
              onPointerDown={preparePdf}
              onClick={savePdf}
            >
              Save
            </button>
            <button type="button" className="t-band px-2 py-2" onClick={() => setOfferOpen(false)}>
              Not now
            </button>
          </div>
        </div>
      ) : null}
      <div
        className="min-h-0 flex-1 overflow-hidden"
        style={{ paddingBottom: `calc(var(--band-h, ${browseBandHeightCss()}) + var(--vv-bottom, 0px))` }}
      >
        {sheet}
      </div>
      <AccountBand
        token={card.publicToken}
        onPreparePdf={preparePdf}
        onPdf={onPdfTap}
      />
    </div>
  );
}

const SHARED_BACK_KEY = "aded:shared-back";

/** Cards this browser already offered Share back for: sent or dismissed, it is not offered again. */
function offeredBefore(token: string): boolean {
  try {
    const list = JSON.parse(window.localStorage.getItem(SHARED_BACK_KEY) ?? "[]") as unknown;
    return Array.isArray(list) && list.includes(token);
  } catch {
    return false;
  }
}

function markOffered(token: string) {
  try {
    const list = JSON.parse(window.localStorage.getItem(SHARED_BACK_KEY) ?? "[]") as unknown;
    const tokens = Array.isArray(list) ? list.filter((entry): entry is string => typeof entry === "string") : [];
    if (!tokens.includes(token)) tokens.push(token);
    window.localStorage.setItem(SHARED_BACK_KEY, JSON.stringify(tokens.slice(-200)));
  } catch {
    /* private mode: offered once per visit */
  }
}

/** My cards with a name; the primary one first. */
function shareBackCards(primaryId: string | null): PortfolioFaceData[] {
  const cards = useAppStore
    .getState()
    .cards.filter((card) => card.displayName.trim())
    .map((card) => ({ id: card.id, name: card.displayName.trim(), title: card.title.trim(), photoAttachmentId: card.photoAttachmentId ?? null }));
  const primary = cards.find((card) => card.id === primaryId);
  return primary ? [primary, ...cards.filter((card) => card !== primary)] : cards;
}

/**
 * Right after Save: one Share back with my card. Several cards show above the button, the primary one chosen.
 * A tap anywhere else closes it and nothing is sent.
 */
function ShareBack({
  cards,
  busy,
  onSend,
  onDismiss,
}: {
  cards: PortfolioFaceData[];
  busy: boolean;
  onSend: (cardId: string) => void;
  onDismiss: () => void;
}) {
  const [chosen, setChosen] = useState(cards[0]?.id ?? null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  });
  useEffect(() => {
    const away = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) dismissRef.current();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, []);

  return (
    <div
      ref={panelRef}
      className="fixed inset-x-0 bottom-0 z-30 bg-white px-[var(--gutter)] pt-3"
      style={{ paddingBottom: "max(12px, var(--vv-bottom, env(safe-area-inset-bottom)))" }}
    >
      {cards.length > 1 ? (
        <div className="mb-3 flex flex-col gap-3">
          {cards.map((card) => (
            <button
              key={card.id}
              type="button"
              aria-pressed={chosen === card.id}
              disabled={busy}
              onClick={() => setChosen(card.id)}
              className="press flex w-full min-w-0 items-center border-0 bg-transparent p-0 text-left [-webkit-tap-highlight-color:transparent]"
              style={{ gap: COLUMN_GAP_PX }}
            >
              <PortfolioFace portfolio={card} selected={chosen === card.id} />
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        disabled={busy || !chosen}
        onClick={() => chosen && onSend(chosen)}
        className="press w-full border-0 bg-sky py-3 t-caps text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]"
      >
        {busy ? "Sharing…" : "Share back"}
      </button>
    </div>
  );
}

function SaveBar({ state, onSave }: { state: SaveState | "deleted"; onSave: () => void }) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 px-[var(--gutter)]"
      style={{ paddingBottom: "max(12px, var(--vv-bottom, env(safe-area-inset-bottom)))" }}
    >
      {state === "deleted" ? (
        <p className="mb-0 text-center t-body text-[var(--grey)]">Profile deleted</p>
      ) : state === "own" ? (
        <p className="mb-0 text-center t-body text-[var(--ink)]">This is your card</p>
      ) : state === "saved" ? (
        <p className="mb-0 bg-sky py-3 text-center t-caps text-[var(--ink)]">Saved</p>
      ) : state === "loading" ? null : (
        <button
          type="button"
          disabled={state === "busy"}
          onClick={onSave}
          className="press w-full border-0 bg-sky py-3 t-caps text-[var(--ink)] [-webkit-tap-highlight-color:transparent]"
        >
          Save to your network
        </button>
      )}
    </div>
  );
}
