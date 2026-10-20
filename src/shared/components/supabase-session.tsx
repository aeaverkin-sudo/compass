"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { clearRegisteredDevice, deviceWasRegistered, markRegisteredDevice } from "@/shared/lib/registered-device";
import {
  clearRegistrationRequired,
  clearStoredAuthTokens,
  consumeSignedOutIgnore,
  ignoreNextSignedOut,
  isDeadAuthSession,
  markLiveSession,
  markRegistrationRequired,
  markSessionBootstrapComplete,
} from "@/shared/lib/session-bootstrap";
import { isCardHydrateRoute, isOwnerAppRoute, skipsClientAuthProbe } from "@/shared/lib/owner-app-route";
import { dropPendingItemUpserts } from "@/shared/services/card-items-sync";
import { dropPendingCardUpserts, hydrateCardsFromServer } from "@/shared/services/card-sync";
import { dropPendingNotes } from "@/shared/services/notes-sync";
import { useAppStore } from "@/shared/store/app-store";

function acceptUser(user: User) {
  if (user.is_anonymous) {
    console.info("[supabase] anonymous session dropped");
    markLiveSession(false);
    ignoreNextSignedOut();
    void createBrowserSupabaseClient().auth.signOut({ scope: "local" });
    clearStoredAuthTokens();
    useAppStore.getState().resetApp();
    if (deviceWasRegistered()) sendRegisteredDeviceToSignIn();
    return;
  }
  markRegisteredDevice();
  clearRegistrationRequired();
  const state = useAppStore.getState();
  if (state.ownerId !== user.id) {
    dropPendingCardUpserts();
    dropPendingItemUpserts();
    dropPendingNotes();
    useAppStore.getState().resetApp();
  }
  useAppStore.setState({ ownerId: user.id });
  markLiveSession(true);
  console.info("[supabase] session", user.id);
}

function sendRegisteredDeviceToSignIn() {
  markRegistrationRequired();
  if (!isOwnerAppRoute(window.location.pathname)) return;
  window.location.replace("/register?signin=1&expired=1");
}

/** A dead cookie is cleared. Nobody is created in its place. */
async function dropDeadSession(supabase: SupabaseClient) {
  clearRegisteredDevice();
  clearRegistrationRequired();
  ignoreNextSignedOut();
  await supabase.auth.signOut({ scope: "local" });
  clearStoredAuthTokens();
  useAppStore.getState().resetApp();
  markLiveSession(false);
}

function startAuthProbe(): () => void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      console.error("[supabase] missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
      markLiveSession(false);
      markSessionBootstrapComplete();
      return () => undefined;
    }

    const supabase = createBrowserSupabaseClient();
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_OUT") return;
      if (consumeSignedOutIgnore()) return;
      if (!deviceWasRegistered()) return;
      console.info("[supabase] registered session ended");
      sendRegisteredDeviceToSignIn();
    });

    void (async () => {
      try {
        const { data: existing, error: existingError } = await supabase.auth.getUser();
        if (isDeadAuthSession(existingError)) {
          console.info("[supabase] dead session");
          await dropDeadSession(supabase);
          return;
        }
        if (existing.user) {
          acceptUser(existing.user);
          return;
        }

        if (existingError && existingError.name !== "AuthSessionMissingError") {
          console.error("[supabase] session check failed", existingError.message);
        }

        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (isDeadAuthSession(refreshError)) {
          console.info("[supabase] dead refresh");
          await dropDeadSession(supabase);
          return;
        }
        if (refreshed.user) {
          acceptUser(refreshed.user);
          return;
        }
        if (refreshError && refreshError.name !== "AuthSessionMissingError") {
          console.error("[supabase] refresh failed", refreshError.message);
        }

        if (deviceWasRegistered()) {
          console.info("[supabase] registered device, session missing");
          sendRegisteredDeviceToSignIn();
        }
        markLiveSession(false);
      } finally {
        markSessionBootstrapComplete();
      }
    })();

    return () => {
      authListener.subscription.unsubscribe();
    };
}

/** Opens an anonymous Supabase session on a new device. Renders nothing. */
export function SupabaseSession() {
  const pathname = usePathname();
  const ownerId = useAppStore((state) => state.ownerId);
  const probeStarted = useRef(false);
  const stopProbe = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!ownerId || !isCardHydrateRoute(pathname)) return;
    void hydrateCardsFromServer();
  }, [pathname, ownerId]);

  useEffect(() => {
    if (skipsClientAuthProbe(pathname)) {
      markSessionBootstrapComplete();
      return;
    }
    if (probeStarted.current) return;
    probeStarted.current = true;
    stopProbe.current = startAuthProbe();
  }, [pathname]);

  useEffect(() => {
    return () => stopProbe.current?.();
  }, []);

  return null;
}
