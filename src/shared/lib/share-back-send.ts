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
const AGAIN_MS = 1500;

export type ShareResult = "sent" | "declined" | "failed";

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
  const body = (await response.json().catch(() => null)) as { declined?: unknown } | null;
  return body?.declined === true ? "declined" : "sent";
}

/**
 * Send one of my cards. `cardId` is the one they picked; without it, the primary card goes.
 * Sent marks the button. Declined does not: they are not taking cards. A failure can be tried once more.
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
    if (result !== "sent") return result;
    live.set(token, { phase: "sent" });
    publish();
    return "sent";
  } finally {
    inflight.delete(token);
  }
}
