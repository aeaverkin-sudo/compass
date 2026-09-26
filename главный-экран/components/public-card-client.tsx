"use client";

import { useEffect, useState } from "react";
import type { DeliveredNote } from "@/shared/services/notes-types";
import { savePublicCardPdf } from "@/shared/services/save-public-card-pdf";
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
 */
export function PublicCardClient({ card, items, publicToken }: PublicCardClientProps) {
  const [notes, setNotes] = useState<DeliveredNote[]>([]);
  const [savingPdf, setSavingPdf] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/c/${encodeURIComponent(publicToken)}/notes`, { method: "POST" })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { notes?: DeliveredNote[]; owner?: boolean };
        if (cancelled || body.owner || !Array.isArray(body.notes) || body.notes.length === 0) return;
        setNotes(body.notes);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [publicToken]);

  return (
    <BusinessCard
      card={card}
      library={items}
      mode="browse"
      readOnly
      deliveredNotes={notes}
      savingPdf={savingPdf}
      onSavePdf={() => {
        if (savingPdf || !publicToken) return;
        setSavingPdf(true);
        void savePublicCardPdf({
          publicToken,
          displayName: card.displayName,
          notes,
        })
          .catch((error) => console.error("[pdf] save failed", error))
          .finally(() => setSavingPdf(false));
      }}
    />
  );
}
