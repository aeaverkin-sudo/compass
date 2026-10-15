"use client";

import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";

/** The last server answer per screen, kept in memory so a return shows it at once. Dropped when the signed-in user changes. */
const memory = new Map<string, unknown>();
let owner: string | null | undefined;
let watching = false;

function watch() {
  if (watching || typeof window === "undefined") return;
  watching = true;
  try {
    createBrowserSupabaseClient().auth.onAuthStateChange((_event, session) => {
      const next = session?.user.id ?? null;
      if (owner !== undefined && next !== owner) memory.clear();
      owner = next;
    });
  } catch {
    watching = false;
  }
}

export function recallAnswer<T>(key: string): T | null {
  watch();
  return (memory.get(key) as T | undefined) ?? null;
}

export function rememberAnswer<T>(key: string, value: T) {
  watch();
  memory.set(key, value);
}
