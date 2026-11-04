"use client";

import { useEffect, useMemo, useState } from "react";
import { useSyncExternalStore } from "react";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { useNewContact } from "@/shared/lib/new-contact";

const SEEN_KEY = "aded:seen-incoming";
const SEEN_EVENT = "aded-seen-incoming";

function readSeenRaw() {
  try {
    return localStorage.getItem(SEEN_KEY) ?? "";
  } catch {
    return "";
  }
}

function parseIds(raw: string) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function subscribeSeen(listener: () => void) {
  window.addEventListener(SEEN_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(SEEN_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

/** The incoming rows on screen have been looked at. A later row lights the dot again. */
export function markIncomingSeen(ids: string[]) {
  try {
    const next = [...new Set([...parseIds(readSeenRaw()), ...ids])];
    localStorage.setItem(SEEN_KEY, JSON.stringify(next));
  } catch {
    /* private mode: the dot stays for this view */
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

function useUnseenIncoming() {
  const raw = useSyncExternalStore(subscribeSeen, readSeenRaw, () => "");
  const [ids, setIds] = useState<string[] | null>(null);

  useEffect(() => {
    let cancel = false;
    const pull = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: auth } = await supabase.auth.getSession();
        const user = auth.session?.user;
        if (!user || user.is_anonymous) {
          if (!cancel) setIds([]);
          return;
        }
        const { data, error } = await supabase
          .from("connections")
          .select("id")
          .eq("owner_id", user.id)
          .eq("state", "pending");
        if (cancel) return;
        setIds(error ? [] : (data ?? []).map((row) => String(row.id)));
      } catch {
        if (!cancel) setIds([]);
      }
    };
    void pull();
    const onFocus = () => void pull();
    window.addEventListener("focus", onFocus);
    return () => {
      cancel = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return useMemo(() => {
    if (!ids || ids.length === 0) return false;
    const seen = new Set(parseIds(raw));
    return ids.some((id) => !seen.has(id));
  }, [ids, raw]);
}

/** The orange dot on Network. A new contact from signup, or an incoming card not yet opened. */
export function useNetworkDot() {
  const fresh = useNewContact();
  const incoming = useUnseenIncoming();
  return fresh || incoming;
}
