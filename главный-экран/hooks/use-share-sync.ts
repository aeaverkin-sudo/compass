"use client";

import { useEffect } from "react";
import { buildCardSnapshot } from "@/shared/services/card-snapshot";
import { useAppStore } from "@/shared/store/app-store";

export function useShareSync() {
  const card = useAppStore((state) => state.card);
  const contactItems = useAppStore((state) => state.contactItems);
  const shareToken = useAppStore((state) => state.user.shareToken);

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
  }, [card, contactItems, shareToken]);
}
