"use client";

import { useEffect } from "react";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { markSessionBootstrapComplete } from "@/shared/lib/session-bootstrap";
import { hydrateCardsFromServer } from "@/shared/services/card-sync";
import { useAppStore } from "@/shared/store/app-store";

function restoreRegisteredOnboarding(isAnonymous: boolean) {
  if (isAnonymous) return;
  const state = useAppStore.getState();
  if (state.user.onboarded) return;
  useAppStore.setState({ user: { ...state.user, onboarded: true } });
}

/** Opens an anonymous Supabase session on first visit. Renders nothing. */
export function SupabaseSession() {
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      console.error("[supabase] missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
      markSessionBootstrapComplete();
      return;
    }

    const supabase = createBrowserSupabaseClient();

    void (async () => {
      try {
        const { data: existing, error: existingError } = await supabase.auth.getUser();
        if (existing.user) {
          restoreRegisteredOnboarding(Boolean(existing.user.is_anonymous));
          console.info(
            "[supabase] session",
            existing.user.id,
            existing.user.is_anonymous ? "trial" : "registered",
          );
          void hydrateCardsFromServer();
          return;
        }

        if (existingError && existingError.name !== "AuthSessionMissingError") {
          console.error("[supabase] session check failed", existingError.message);
        }

        const { data, error } = await supabase.auth.signInAnonymously();
        if (error || !data.user) {
          console.error("[supabase] anonymous sign-in failed", error?.message ?? "no user");
          return;
        }

        console.info("[supabase] session", data.user.id, "trial");
        void hydrateCardsFromServer();
      } finally {
        markSessionBootstrapComplete();
      }
    })();
  }, []);

  return null;
}
