"use client";

import { useSyncExternalStore } from "react";

const DONE_KEY = "aded:share-back-done";
const UNDO_MS = 3000;

type Phase = "idle" | "undo" | "sent";

type Live = { phase: Phase; pendingId: string | null; timer: number | null };

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

function commit(token: string) {
  const row = live.get(token);
  if (!row || row.phase !== "undo") return;
  if (row.timer != null) window.clearTimeout(row.timer);
  live.set(token, { phase: "sent", pendingId: null, timer: null });
  publish();
}

/** Delete drops the old send. A later add of the same card can share back again. */
export function forgetShareBack(token: string) {
  const row = live.get(token);
  if (row?.timer != null) window.clearTimeout(row.timer);
  live.delete(token);
  writeDone(readDone().filter((entry) => entry !== token));
  publish();
}

/** One tap. Undo lasts three seconds and takes the request back when one was written. */
export async function sendShareBack(token: string) {
  if (shareBackPhase(token) !== "idle") return;
  const primary = await fetch("/api/cards/primary", { cache: "no-store" });
  if (!primary.ok) return;
  const card = (await primary.json()) as { cardId?: string | null };
  if (!card.cardId) return;
  const response = await fetch("/api/connections/share-back", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromCardId: card.cardId, toCardToken: token }),
  });
  if (!response.ok) return;
  const body = (await response.json()) as { pendingId?: string | null };
  const pendingId = typeof body.pendingId === "string" ? body.pendingId : null;
  const timer = window.setTimeout(() => commit(token), UNDO_MS);
  live.set(token, { phase: "undo", pendingId, timer });
  publish();
}

export async function undoShareBack(token: string) {
  const row = live.get(token);
  if (!row || row.phase !== "undo") return;
  if (row.timer != null) window.clearTimeout(row.timer);
  live.delete(token);
  publish();
  if (!row.pendingId) return;
  await fetch("/api/connections/share-back", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pendingId: row.pendingId }),
  }).catch(() => undefined);
}
