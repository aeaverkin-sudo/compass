"use client";

import { useEffect } from "react";
import { forgetLocalNotes, notesAreSyncing, notesHandoffActive, settleTakenHandoff } from "@/shared/services/notes-sync";
import type { NextScanAddon } from "@/shared/types";

const POLL_MS = 500;

/**
 * A scan on another phone empties the server list. The owner's card drops every note on the next tick.
 * Skips while a local write is still in flight. A share waits for its one open, then the next note can upload.
 */
export function useOwnerNotesDelivery(cardId: string, hasNotes: boolean) {
  useEffect(() => {
    if (!hasNotes || !cardId) return;

    let cancelled = false;
    const tick = async () => {
      if (cancelled || notesAreSyncing(cardId)) return;
      try {
        const response = await fetch(`/api/notes?cardId=${encodeURIComponent(cardId)}`, { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as { notes?: NextScanAddon[]; held?: boolean };
        const notes = body.notes ?? [];
        if (notesHandoffActive(cardId)) {
          if (body.held || notes.length > 0) return;
          settleTakenHandoff(cardId);
          return;
        }
        // `held` means this batch was already sent from another screen. An empty list means a scan took it.
        if (!body.held && notes.length > 0) return;
        forgetLocalNotes(cardId);
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
