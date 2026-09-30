"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DeliveredNote } from "@/shared/services/notes-types";
import { primePublicCardPdf, shareCardPdf, type CardPdfInput } from "@/shared/services/save-public-card-pdf";
import { CardPdfSource } from "@/shared/components/card-pdf-source";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { BusinessCard } from "@main/components/business-card";
import type { Card, ContactItem } from "@/shared/types";

type PublicCardClientProps = {
  card: Card;
  items: ContactItem[];
  publicToken: string;
};

/**
 * SSR shows the card with empty notes. A browser then asks once for delivery.
 * Crawlers without JS leave the pending row alone.
 * Notes ride along once delivered. The received card has no share control.
 */
export function PublicCardClient({ card, items, publicToken }: PublicCardClientProps) {
  const router = useRouter();
  const [notes, setNotes] = useState<DeliveredNote[]>([]);
  const [notesReady, setNotesReady] = useState(false);
  const [offerOpen, setOfferOpen] = useState(true);
  const [networkNote, setNetworkNote] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/c/${encodeURIComponent(publicToken)}/notes`, { method: "POST" })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { notes?: DeliveredNote[]; owner?: boolean };
        if (cancelled || !Array.isArray(body.notes) || body.notes.length === 0) return;
        setNotes(body.notes);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setNotesReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [publicToken]);

  const pdfInput = (): CardPdfInput => ({
    cardId: card.id,
    publicToken,
    displayName: card.displayName,
    notes,
  });

  useEffect(() => {
    if (!notesReady) return;
    void primePublicCardPdf({
      cardId: card.id,
      publicToken,
      displayName: card.displayName,
      notes,
    }).catch(() => undefined);
  }, [notesReady, card.id, card.displayName, publicToken, notes]);

  useEffect(() => {
    if (!networkNote) return;
    const done = window.setTimeout(() => setNetworkNote(false), 2600);
    return () => window.clearTimeout(done);
  }, [networkNote]);

  const savePdf = () => {
    setOfferOpen(false);
    void shareCardPdf(pdfInput());
  };

  const follow = () => {
    void createBrowserSupabaseClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!data.user || data.user.is_anonymous) {
          router.push("/register");
          return;
        }
        setNetworkNote(true);
      })
      .catch(() => router.push("/register"));
  };

  const registerUrl = typeof window === "undefined" ? "/register" : `${window.location.origin}/register`;

  return (
    <>
      {notesReady ? (
        <CardPdfSource
          key={`${publicToken}:${notes.map((note) => `${note.id}:${note.content}`).join("|")}`}
          input={pdfInput()}
          registerUrl={registerUrl}
          epoch={0}
        >
          {(mask) => (
            <BusinessCard pdf pdfMask={mask} readOnly card={card} library={items} mode="browse" deliveredNotes={notes} />
          )}
        </CardPdfSource>
      ) : null}
      <BusinessCard
        card={card}
        library={items}
        mode="browse"
        readOnly
        deliveredNotes={notes}
        publicBar={
          <PublicCardBar
            onSave={savePdf}
            onPrepare={() => {
              void primePublicCardPdf(pdfInput()).catch(() => undefined);
            }}
            onFollow={follow}
          />
        }
      />
      <p className="px-8 py-8 text-center">
        <Link href="/register" className="text-[13px] font-light text-[#111] underline">
          Create your profile
        </Link>
      </p>
      {offerOpen ? (
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
      ) : null}
      {networkNote ? (
        <p
          className="pointer-events-none fixed top-1/2 left-1/2 z-40 w-[min(280px,calc(100vw-3rem))] -translate-x-1/2 -translate-y-1/2 bg-sky px-5 py-4 text-center text-[16px] font-normal leading-snug text-[#111]"
          style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}
        >
          Coming with your network
        </p>
      ) : null}
    </>
  );
}

/** Same sky band as the card nav: full width, Helvetica, uppercase, #111 on --sky. */
function PublicCardBar({
  onSave,
  onPrepare,
  onFollow,
}: {
  onSave: () => void;
  onPrepare: () => void;
  onFollow: () => void;
}) {
  return (
    <nav
      className="compass-sky-band bg-sky px-[calc(clamp(24px,6.1vw,28px)-3mm)] text-[12px] leading-[1.45] font-normal tracking-[0.1em] text-[#111] uppercase select-none [-webkit-touch-callout:none]"
      style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', paddingBottom: "var(--band-safe, 0px)" }}
    >
      <div className="grid grid-cols-2 items-baseline">
        <button
          type="button"
          className="justify-self-start px-2 py-4 uppercase"
          onPointerDown={onPrepare}
          onClick={onSave}
        >
          Save PDF
        </button>
        <button type="button" className="justify-self-end px-2 py-4 uppercase" onClick={onFollow}>
          Follow
        </button>
      </div>
    </nav>
  );
}
