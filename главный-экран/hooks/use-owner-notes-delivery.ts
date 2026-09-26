"use client";

import { useEffect } from "react";
import { notesAreSyncing } from "@/shared/services/notes-sync";
import type { NextScanAddon } from "@/shared/types";

const POLL_MS = 4000;

/**
 * After a stranger consumes the pending transfer, the owner's local notes clear.
 * Skips while a local write is still in flight.
 */
export function useOwnerNotesDelivery(cardId: string, hasNotes: boolean) {
  useEffect(() => {
    if (!hasNotes || !cardId) return;

    let cancelled = false;
    const tick = async () => {
      if (cancelled || notesAreSyncing(cardId)) return;
      try {
        const response = await fetch(`/api/notes?cardId=${cardId}`);
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as { notes?: NextScanAddon[] };
        const notes = body.notes ?? [];
        if (notes.length > 0) return;
        const { useAppStore: store } = await import("@/shared/store/app-store");
        const card = store.getState().cards.find((entry) => entry.id === cardId);
        if (!card?.nextScanAddons.length) return;
        store.setState({
          cards: store.getState().cards.map((entry) =>
            entry.id === cardId ? { ...entry, nextScanAddons: [] } : entry,
          ),
        });
      } catch {
        // Next tick retries.
      }
    };

    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [cardId, hasNotes]);
}
