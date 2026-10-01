"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRegistrationRequired, useSessionBootstrap } from "@/shared/hooks/use-session-bootstrap";
import { deviceWasRegistered } from "@/shared/lib/registered-device";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { useStoreHydrated } from "@/shared/hooks/use-store-hydrated";

/**
 * Trial entry from TRY IT. An anonymous session, then the existing landing.
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
      const user = data.user;

      if (!user) {
        if (deviceWasRegistered()) return;
        const signed = await supabase.auth.signInAnonymously();
        if (cancelled || signed.error || !signed.data.user?.is_anonymous) return;
      }

      if (cancelled) return;
      router.replace("/");
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, sessionReady, needsSignIn, router]);

  return <div className="h-lvh bg-background" aria-hidden />;
}
