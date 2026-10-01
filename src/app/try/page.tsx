"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRegistrationRequired, useSessionBootstrap } from "@/shared/hooks/use-session-bootstrap";
import { deviceWasRegistered } from "@/shared/lib/registered-device";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { useStoreHydrated } from "@/shared/hooks/use-store-hydrated";
import { useAppStore } from "@/shared/store/app-store";

/**
 * Trial entry from TRY IT. An anonymous session, then the working /main screen.
 * The 24h clock still starts on Confirm.
 */
export default function TryPage() {
  const router = useRouter();
  const hydrated = useStoreHydrated();
  const sessionReady = useSessionBootstrap();
  const needsSignIn = useRegistrationRequired();

  useEffect(() => {
    if (!hydrated || !sessionReady || needsSignIn) return;
    let cancelled = false;

    void (async () => {
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase.auth.getUser();
      let user = data.user;

      if (!user) {
        if (deviceWasRegistered()) return;
        const signed = await supabase.auth.signInAnonymously();
        if (cancelled || signed.error || !signed.data.user?.is_anonymous) return;
        user = signed.data.user;
      }

      if (cancelled) return;
      if (user.is_anonymous) {
        const state = useAppStore.getState();
        if (!state.user.onboarded) {
          useAppStore.setState({ user: { ...state.user, onboarded: true } });
        }
      }
      router.replace("/main");
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, sessionReady, needsSignIn, router]);

  return <div className="h-lvh bg-background" aria-hidden />;
}
