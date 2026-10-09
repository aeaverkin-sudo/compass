"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { DeliveredNote } from "@/shared/services/notes-types";
import { primePublicCardPdf, shareCardPdf, type CardPdfInput } from "@/shared/services/save-public-card-pdf";
import { AccountBand } from "@/shared/components/account-band";
import { BackButton } from "@/shared/components/back-button";
import { CardPdfSource } from "@/shared/components/card-pdf-source";
import { BusinessCard } from "@main/components/business-card";
import type { Card, ContactItem } from "@/shared/types";

type PublicCardClientProps = {
  card: Card;
  items: ContactItem[];
  publicToken: string;
  /** Opened from Network. Same card, back to the list, no sky plaque. */
  inside?: boolean;
};

/**
 * SSR shows the card with empty notes. A browser then asks once for delivery.
 * Crawlers without JS leave the pending row alone.
 * Notes ride along once delivered. The received card has no share control.
 */
export function PublicCardClient({ card, items, publicToken, inside = false }: PublicCardClientProps) {
  const [notes, setNotes] = useState<DeliveredNote[]>([]);
  const [notesReady, setNotesReady] = useState(false);
  const [offerOpen, setOfferOpen] = useState(true);
  const [held, setHeld] = useState(inside);
  const [plaqueHeight, setPlaqueHeight] = useState(0);
  const plaqueRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetch(`/api/c/${encodeURIComponent(publicToken)}/notes`, { method: "POST" }),
      inside ? Promise.resolve(null) : fetch("/api/connections", { cache: "no-store" }),
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
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setNotesReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [inside, publicToken, card.publicToken]);

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

  useEffect(() => {
    if (!offer) return;
    void primePublicCardPdf({
      cardId: card.id,
      publicToken,
      displayName: card.displayName,
      notes,
    }).catch(() => undefined);
  }, [offer, card.id, card.displayName, publicToken, notes]);

  const preparePdf = () => {
    void primePublicCardPdf(pdfInput()).catch(() => undefined);
  };

  const savePdf = () => {
    setOfferOpen(false);
    void shareCardPdf(pdfInput());
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
              void shareCardPdf(pdfInput());
            }}
          />
        )
      }
    />
  );

  const pdfSheets = offer ? (
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
        <BackButton fallbackHref="/network" />
        {sheet}
      </div>
    );
  }

  return (
    <div
      className="compass-main fixed inset-y-0 flex flex-col overflow-hidden bg-white"
      style={{ "--card-frame-top": `${plaqueHeight}px` } as CSSProperties}
    >
      {pdfSheets}
      {offer ? (
        <div
          ref={plaqueRef}
          className="shrink-0 bg-sky px-5 py-4 text-center text-[16px] font-normal leading-snug text-[#111]"
          style={{
            fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
            paddingTop: "calc(env(safe-area-inset-top) + 16px)",
          }}
        >
          <p>Save this portfolio as a PDF</p>
          <div className="mt-3 flex items-baseline justify-center gap-6 text-[16px] font-normal">
            <button
              type="button"
              className="px-2 py-2"
              onPointerDown={preparePdf}
              onClick={savePdf}
            >
              Save
            </button>
            <button type="button" className="px-2 py-2" onClick={() => setOfferOpen(false)}>
              Not now
            </button>
          </div>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-hidden">{sheet}</div>
    </div>
  );
}
