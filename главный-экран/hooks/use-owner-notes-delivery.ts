"use client";

import { useEffect } from "react";
import { notesAreSyncing, notesHandoffActive } from "@/shared/services/notes-sync";
import type { NextScanAddon } from "@/shared/types";

const POLL_MS = 500;

/**
 * A scan on another phone empties the server list. The owner's card drops every note on the next tick.
 * Skips while a local write is still in flight, and while a share is still waiting for its one open.
 */
export function useOwnerNotesDelivery(cardId: string, hasNotes: boolean) {
  useEffect(() => {
    if (!hasNotes || !cardId) return;

    let cancelled = false;
    const tick = async () => {
      if (cancelled || notesAreSyncing(cardId) || notesHandoffActive(cardId)) return;
      try {
        const response = await fetch(`/api/notes?cardId=${encodeURIComponent(cardId)}`, { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as { notes?: NextScanAddon[]; held?: boolean };
        // `held` means this batch was already sent. An empty list means a scan took it.
        if (!body.held && (body.notes ?? []).length > 0) return;
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

    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };

    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, POLL_MS);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [cardId, hasNotes]);
}
