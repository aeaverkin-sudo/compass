"use client";

import { useSyncExternalStore } from "react";

const DONE_KEY = "aded:share-back-done";

export const SWAP_CLOSED = "This account is not accepting swaps.";
/** Fully visible for 2.2s. The plaque's own fade-in and fade-out make the whole toast 4s. */
export const SWAP_CLOSED_HOLD_MS = 2200;

type Phase = "idle" | "sent" | "declined";

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
const AGAIN_MS = 1500;

export type ShareResult = "sent" | "declined" | "already" | "failed";

async function postShare(token: string, cardId?: string): Promise<ShareResult> {
  let fromCardId = cardId?.trim() ?? "";
  if (!fromCardId) {
    const primary = await fetch("/api/cards/primary", { cache: "no-store" });
    if (!primary.ok) return "failed";
    const card = (await primary.json()) as { cardId?: string | null };
    fromCardId = card.cardId ?? "";
  }
  if (!fromCardId) return "failed";
  const response = await fetch("/api/connections/share-back", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromCardId, toCardToken: token }),
  });
  if (!response.ok) return "failed";
  const body = (await response.json().catch(() => null)) as { declined?: unknown; already?: unknown } | null;
  if (body?.already === true) return "already";
  return body?.declined === true ? "declined" : "sent";
}

/**
 * Send one of my cards. `cardId` is the one they picked; without it, the primary card goes.
 * Sent, declined, and a repeated attempt all leave Swap grey. A failure can be tried once more.
 */
export async function sendShareBack(token: string, cardId?: string): Promise<ShareResult> {
  if (!token || shareBackPhase(token) !== "idle" || inflight.has(token)) return "failed";
  inflight.add(token);
  try {
    let result: ShareResult = "failed";
    try {
      result = await postShare(token, cardId);
    } catch {
      result = "failed";
    }
    if (result === "failed") {
      await new Promise((resolve) => window.setTimeout(resolve, AGAIN_MS));
      try {
        result = await postShare(token, cardId);
      } catch {
        result = "failed";
      }
    }
    if (result === "failed") return result;
    live.set(token, { phase: result === "sent" ? "sent" : "declined" });
    publish();
    return result;
  } finally {
    inflight.delete(token);
  }
}
