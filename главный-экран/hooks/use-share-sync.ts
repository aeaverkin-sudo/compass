"use client";

import { useEffect } from "react";
import { buildCardSnapshot } from "@/shared/services/card-snapshot";
import { selectActiveCard, useAppStore } from "@/shared/store/app-store";

const STATUS_POLL_MS = 3000;

export function useShareSync() {
  const cards = useAppStore((state) => state.cards);
  const currentCardIndex = useAppStore((state) => state.currentCardIndex);
  const contactItems = useAppStore((state) => state.contactItems);
  const shareToken = useAppStore((state) => state.user.shareToken);
  const updateCard = useAppStore((state) => state.updateCard);
  const card = selectActiveCard(cards, currentCardIndex);

  const addonFingerprint =
    card?.nextScanAddons?.map((addon) => `${addon.id}:${addon.type}:${addon.content.slice(0, 24)}`).join("|") ??
    "";

  useEffect(() => {
    if (!card) return;

    const snapshot = buildCardSnapshot(card, contactItems);

    void fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: shareToken,
        snapshot,
        ownerName: card.displayName,
      }),
    });
  }, [card, contactItems, shareToken, addonFingerprint]);

  useEffect(() => {
    if (!card?.nextScanAddons?.length || !shareToken) return;

    const poll = async () => {
      try {
        const response = await fetch(`/api/share/${shareToken}/status`);
        if (!response.ok) return;
        const { nextScanDelivered } = (await response.json()) as { nextScanDelivered: boolean };
        if (nextScanDelivered) {
          updateCard(card.id, { nextScanAddons: [] });
        }
      } catch {
        /* ignore */
      }
    };

    void poll();
    const intervalId = window.setInterval(poll, STATUS_POLL_MS);
    return () => window.clearInterval(intervalId);
  }, [card?.id, card?.nextScanAddons, shareToken, updateCard]);
}
