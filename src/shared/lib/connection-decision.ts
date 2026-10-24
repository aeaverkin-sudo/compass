"use client";

import { useSyncExternalStore } from "react";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";

const UNDO_MS = 3000;

type Kind = "accepting" | "removing";

type Entry = {
  kind: Kind;
  token: number;
  timer: number | null;
};

export type ConnectionDecisions = {
  accepting: ReadonlySet<string>;
  removing: ReadonlySet<string>;
  gone: ReadonlySet<string>;
};

const entries = new Map<string, Entry>();
const gone = new Set<string>();
const empty: ConnectionDecisions = { accepting: new Set(), removing: new Set(), gone: new Set() };
let snap: ConnectionDecisions = empty;
const listeners = new Set<() => void>();
let cachedOwner: string | null = null;

function publish() {
  snap = {
    accepting: new Set([...entries].filter(([, entry]) => entry.kind === "accepting").map(([id]) => id)),
    removing: new Set([...entries].filter(([, entry]) => entry.kind === "removing").map(([id]) => id)),
    gone: new Set(gone),
  };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useConnectionDecisions() {
  return useSyncExternalStore(subscribe, () => snap, () => empty);
}

async function ownerId() {
  if (cachedOwner) return cachedOwner;
  const { data } = await createBrowserSupabaseClient().auth.getSession();
  cachedOwner = data.session?.user.id ?? null;
  return cachedOwner;
}

function clearTimer(id: string) {
  const entry = entries.get(id);
  if (entry?.timer != null) window.clearTimeout(entry.timer);
}

function begin(id: string, kind: Kind, timer: number | null) {
  clearTimer(id);
  const token = (entries.get(id)?.token ?? 0) + 1;
  entries.set(id, { kind, token, timer });
  publish();
  return token;
}

/** Yes. The row stays in the book as an ordinary contact. */
export function acceptConnection(id: string) {
  const token = begin(id, "accepting", null);
  void (async () => {
    const userId = await ownerId();
    const { error } = userId
      ? await createBrowserSupabaseClient().from("connections").update({ state: "active" }).eq("id", id).eq("owner_id", userId)
      : { error: { message: "signed out" } };
    const entry = entries.get(id);
    if (!entry || entry.token !== token) return;
    if (error) {
      entries.delete(id);
      publish();
    }
  })();
}

/** No. The row leaves the list now. The delete itself waits three seconds. */
export function declineConnection(id: string) {
  if (entries.get(id)?.kind === "removing" || gone.has(id)) return;
  const token = begin(id, "removing", 0);
  const timer = window.setTimeout(() => {
    void finishDecline(id, token);
  }, UNDO_MS);
  const entry = entries.get(id);
  if (entry && entry.token === token) entry.timer = timer;
}

/** Undo inside the three seconds. Nothing was deleted. */
export function undoDecline(id: string) {
  const entry = entries.get(id);
  if (!entry || entry.kind !== "removing" || entry.timer == null) return;
  clearTimer(id);
  entries.delete(id);
  publish();
}

async function finishDecline(id: string, token: number) {
  const entry = entries.get(id);
  if (!entry || entry.token !== token || entry.kind !== "removing") return;
  entry.timer = null;
  const userId = await ownerId();
  const { error } = userId
    ? await createBrowserSupabaseClient().from("connections").delete().eq("id", id).eq("owner_id", userId)
    : { error: { message: "signed out" } };
  const latest = entries.get(id);
  if (!latest || latest.token !== token) return;
  entries.delete(id);
  if (!error) gone.add(id);
  publish();
}

/** The server already returned this row as active, so the local Yes mark can go. */
export function releaseIfAccepted(id: string) {
  const entry = entries.get(id);
  if (!entry || entry.kind !== "accepting") return;
  entries.delete(id);
  publish();
}
