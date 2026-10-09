"use client";

import { useEffect, useState, type CSSProperties } from "react";
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

  useEffect(() => {
    if (!offer) return;
    void primePublicCardPdf({
      cardId: card.id,
      publicToken,
      displayName: card.displayName,
      notes,
    }).catch(() => undefined);
  }, [offer, card.id, card.displayName, publicToken, notes]);

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
      publicBar={inside ? undefined : <AccountBand token={card.publicToken} />}
    />
  );

  const fileOffer = offer ? (
    <>
      <CardPdfSource
        key={`${publicToken}:${notes.map((note) => `${note.id}:${note.content}`).join("|")}`}
        input={pdfInput()}
        epoch={0}
      >
        {(mask) => (
          <BusinessCard pdf pdfMask={mask} readOnly card={card} library={items} mode="browse" deliveredNotes={notes} />
        )}
      </CardPdfSource>
      <div className="fixed inset-0 z-40" onClick={() => setOfferOpen(false)}>
        <div
          className="absolute top-1/2 left-1/2 w-[min(280px,calc(100vw-3rem))] -translate-x-1/2 -translate-y-1/2 bg-sky px-5 py-4 text-center text-[16px] font-normal leading-snug text-[#111]"
          style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}
          onClick={(event) => event.stopPropagation()}
        >
          <p>Save this portfolio as a PDF</p>
          <div className="mt-3 flex items-baseline justify-center gap-6 text-[16px] font-normal">
            <button
              type="button"
              className="px-2 py-2"
              onPointerDown={() => {
                void primePublicCardPdf(pdfInput()).catch(() => undefined);
              }}
              onClick={savePdf}
            >
              Save
            </button>
            <button type="button" className="px-2 py-2" onClick={() => setOfferOpen(false)}>
              Not now
            </button>
          </div>
        </div>
      </div>
    </>
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
    <>
      {fileOffer}
      {sheet}
    </>
  );
}
