"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { PortfolioFace, type PortfolioFaceData } from "@/shared/components/portfolio-face";
import { useStoreHydrated } from "@/shared/hooks/use-store-hydrated";
import { COLUMN_GAP_PX } from "@/shared/layout/axes";
import { useAppStore } from "@/shared/store/app-store";
import type { Card } from "@/shared/types";

const SHARED_BACK_KEY = "aded:shared-back";

/** Cards this browser already answered Share back for: sent or dismissed, it is not offered again. */
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
function shareBackCards(cards: Card[], primaryId: string | null): PortfolioFaceData[] {
  const named = cards
    .filter((card) => card.displayName.trim())
    .map((card) => ({ id: card.id, name: card.displayName.trim(), title: card.title.trim(), photoAttachmentId: card.photoAttachmentId ?? null }));
  const primary = named.find((card) => card.id === primaryId);
  return primary ? [primary, ...named.filter((card) => card !== primary)] : named;
}

/**
 * Right after a save: Share back with my card, until it is sent or dismissed.
 * It waits for my cards to load. With nothing to offer, `fallback` shows instead.
 */
export function ShareBackOffer({ token, fallback = null }: { token: string; fallback?: ReactNode }) {
  const hydrated = useStoreHydrated();
  const cards = useAppStore((state) => state.cards);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/cards/primary", { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<{ cardId?: string | null }>) : null))
      .then((body) => {
        if (!cancelled) setPrimaryId(body?.cardId ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const offer = hydrated && !answered && !offeredBefore(token) ? shareBackCards(cards, primaryId) : [];
  if (offer.length === 0) return <>{fallback}</>;

  const close = () => {
    if (busy) return;
    markOffered(token);
    setAnswered(true);
  };

  const send = async (cardId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/connections/share-back", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromCardId: cardId, toCardToken: token }),
      });
    } catch {
      /* no receipts either way */
    }
    markOffered(token);
    setBusy(false);
    setAnswered(true);
  };

  return <ShareBackPanel key={offer.map((card) => card.id).join(",")} cards={offer} busy={busy} onSend={(id) => void send(id)} onDismiss={close} />;
}

/** Several cards show above the button, the primary one chosen. A tap elsewhere closes it and nothing is sent. */
function ShareBackPanel({
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
    const away = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) dismissRef.current();
    };
    document.addEventListener("click", away);
    return () => document.removeEventListener("click", away);
  }, []);

  return (
    <div
      ref={panelRef}
      className="fixed inset-x-0 bottom-0 z-30 bg-white px-[var(--gutter)] pt-3"
      style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
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
