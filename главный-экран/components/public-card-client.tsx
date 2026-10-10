"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { DeliveredNote } from "@/shared/services/notes-types";
import { primePublicCardPdf, shareCardPdf, type CardPdfInput } from "@/shared/services/save-public-card-pdf";
import { AccountBand } from "@/shared/components/account-band";
import { BackButton } from "@/shared/components/back-button";
import { CardPdfSource } from "@/shared/components/card-pdf-source";
import { SkyToast } from "@/shared/components/sky-toast";
import { BusinessCard } from "@main/components/business-card";
import type { Card, ContactItem } from "@/shared/types";

type PublicCardClientProps = {
  card: Card;
  items: ContactItem[];
  publicToken: string;
  /** Opened from Network. Same card, back to the list, no sky plaque. */
  inside?: boolean;
  /** In-app scan. One Save, then the person stays on this card. */
  save?: boolean;
};

type SaveState = "loading" | "ready" | "saved" | "own" | "busy";

/**
 * SSR shows the card with empty notes. A browser then asks once for delivery.
 * Crawlers without JS leave the pending row alone.
 * Notes ride along once delivered. The received card has no share control.
 */
export function PublicCardClient({ card, items, publicToken, inside = false, save = false }: PublicCardClientProps) {
  const router = useRouter();
  const [notes, setNotes] = useState<DeliveredNote[]>([]);
  const [notesReady, setNotesReady] = useState(false);
  const [offerOpen, setOfferOpen] = useState(true);
  const [held, setHeld] = useState(inside);
  const [plaqueHeight, setPlaqueHeight] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>(save ? "loading" : "ready");
  const [notice, setNotice] = useState<string | null>(null);
  const plaqueRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
  }, [inside, save, publicToken, card.publicToken]);

  const pdfInput = (): CardPdfInput => ({
    cardId: card.id,
    publicToken,
    displayName: card.displayName,
    notes,
  });

  const offer = !inside && notesReady && !held && offerOpen;
  const [paintPdf, setPaintPdf] = useState(false);

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

  const preparePdf = () => {
    setPaintPdf(true);
    setNotice("Preparing PDF…");
    void primePublicCardPdf(pdfInput()).catch(() => undefined);
  };

  const savePdf = () => {
    setOfferOpen(false);
    preparePdf();
    void shareCardPdf(pdfInput()).finally(() => {
      setNotice((current) => (current === "Preparing PDF…" ? null : current));
    });
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
    } catch {
      setSaveState("ready");
    }
  };

  const sheet = (
    <BusinessCard
      card={card}
      library={items}
      mode="browse"
      readOnly
      deliveredNotes={notes}
      publicBar={
        inside ? undefined : (
          <AccountBand
            token={card.publicToken}
            onPreparePdf={preparePdf}
            onPdf={() => {
              preparePdf();
              void shareCardPdf(pdfInput()).finally(() => {
                setNotice((current) => (current === "Preparing PDF…" ? null : current));
              });
            }}
          />
        )
      }
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
        <BackButton fallbackHref="/network" onBack={save ? () => router.push("/network") : undefined} />
        {sheet}
        {save ? <SaveBar state={saveState} onSave={() => void keep()} /> : null}
      </div>
    );
  }

  return (
    <div
      className="compass-main fixed inset-y-0 flex flex-col overflow-hidden bg-white"
      style={{ "--card-frame-top": `${plaqueHeight}px` } as CSSProperties}
    >
      {notice ? <SkyToast key={notice} text={notice} onDone={() => setNotice(null)} /> : null}
      {pdfSheets}
      {offer ? (
        <div
          ref={plaqueRef}
          className="t-caps shrink-0 bg-sky px-5 py-4 text-center text-[#111]"
          style={{
            fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
            paddingTop: "calc(env(safe-area-inset-top) + 16px)",
          }}
        >
          <p>Save this portfolio as a PDF</p>
          <div className="mt-3 flex items-baseline justify-center gap-6">
            <button
              type="button"
              className="t-caps px-2 py-2"
              onPointerDown={preparePdf}
              onClick={savePdf}
            >
              Save
            </button>
            <button type="button" className="t-caps px-2 py-2" onClick={() => setOfferOpen(false)}>
              Not now
            </button>
          </div>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-hidden">{sheet}</div>
    </div>
  );
}

function SaveBar({ state, onSave }: { state: SaveState; onSave: () => void }) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 px-[var(--gutter)]"
      style={{ paddingBottom: "max(12px, var(--vv-bottom, env(safe-area-inset-bottom)))" }}
    >
      {state === "own" ? (
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
