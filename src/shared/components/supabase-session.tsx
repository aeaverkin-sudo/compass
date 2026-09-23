"use client";

import { useEffect } from "react";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { hydrateCardsFromServer } from "@/shared/services/card-sync";

/** Opens an anonymous Supabase session on first visit. Renders nothing. */
export function SupabaseSession() {
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      console.error("[supabase] missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
      return;
    }

    const supabase = createBrowserSupabaseClient();

    void (async () => {
      const { data: existing, error: existingError } = await supabase.auth.getUser();
      if (existing.user) {
        console.info("[supabase] anonymous user", existing.user.id);
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

      console.info("[supabase] anonymous user", data.user.id);
      void hydrateCardsFromServer();
    })();
  }, []);

  return null;
}
