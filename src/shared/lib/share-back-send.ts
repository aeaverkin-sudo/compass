"use client";

import { useSyncExternalStore } from "react";

const DONE_KEY = "aded:share-back-done";

type Phase = "idle" | "sent";

type Live = { phase: Phase };

const live = new Map<string, Live>();
const listeners = new Set<() => void>();

function readDone(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(DONE_KEY) ?? "[]") as unknown;
    return Array.isArray(list) ? list.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function writeDone(tokens: string[]) {
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify(tokens.slice(-200)));
  } catch {
    /* private mode */
  }
}

function publish() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function shareBackPhase(token: string): Phase {
  return live.get(token)?.phase ?? "idle";
}

export function useShareBack(token: string) {
  return useSyncExternalStore(subscribe, () => shareBackPhase(token), () => "idle" as const);
}

/** Delete drops the old send. A later add of the same card can share back again. */
export function forgetShareBack(token: string) {
  live.delete(token);
  writeDone(readDone().filter((entry) => entry !== token));
  publish();
}

const inflight = new Set<string>();

/**
 * Send one of my cards. `cardId` is the one they picked; without it, the primary card goes.
 * The button becomes Shared back at once. This path has no Undo — the toast is the confirmation.
 */
export async function sendShareBack(token: string, cardId?: string): Promise<boolean> {
  if (!token || shareBackPhase(token) !== "idle" || inflight.has(token)) return false;
  inflight.add(token);
  try {
    let fromCardId = cardId?.trim() ?? "";
    if (!fromCardId) {
      const primary = await fetch("/api/cards/primary", { cache: "no-store" });
      if (!primary.ok) return false;
      const card = (await primary.json()) as { cardId?: string | null };
      fromCardId = card.cardId ?? "";
    }
    if (!fromCardId) return false;
    const response = await fetch("/api/connections/share-back", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromCardId, toCardToken: token }),
    });
    if (!response.ok) return false;
    live.set(token, { phase: "sent" });
    publish();
    return true;
  } catch {
    return false;
  } finally {
    inflight.delete(token);
  }
}
