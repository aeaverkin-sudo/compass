"use client";

import { useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { deviceWasRegistered, markRegisteredDevice } from "@/shared/lib/registered-device";
import {
  clearRegistrationRequired,
  consumeOAuthReplaceLocal,
  consumeSignedOutIgnore,
  ignoreNextSignedOut,
  markRegistrationRequired,
  markSessionBootstrapComplete,
} from "@/shared/lib/session-bootstrap";
import { dropPendingItemUpserts } from "@/shared/services/card-items-sync";
import { dropPendingCardUpserts, hydrateCardsFromServer } from "@/shared/services/card-sync";
import { dropPendingNotes } from "@/shared/services/notes-sync";
import { useAppStore } from "@/shared/store/app-store";

function restoreRegisteredOnboarding(isAnonymous: boolean) {
  if (isAnonymous) return;
  const state = useAppStore.getState();
  if (state.user.onboarded) return;
  const hasPortfolio = state.cards.some(
    (card) => card.displayName.trim().length > 0 || Boolean(card.photoAttachmentId),
  );
  if (!hasPortfolio) return;
  useAppStore.setState({ user: { ...state.user, onboarded: true } });
}

function acceptUser(user: User) {
  if (user.is_anonymous && deviceWasRegistered()) {
    console.info("[supabase] anonymous session on a registered device");
    ignoreNextSignedOut();
    void createBrowserSupabaseClient().auth.signOut({ scope: "local" });
    sendRegisteredDeviceToSignIn();
    return;
  }
  if (!user.is_anonymous) {
    markRegisteredDevice();
    clearRegistrationRequired();
    if (consumeOAuthReplaceLocal()) {
      dropPendingCardUpserts();
      dropPendingItemUpserts();
      dropPendingNotes();
      const state = useAppStore.getState();
      useAppStore.setState({
        cards: [],
        contactItems: [],
        currentCardIndex: 0,
        user: { ...state.user, onboarded: true },
      });
    }
  }
  restoreRegisteredOnboarding(Boolean(user.is_anonymous));
  console.info("[supabase] session", user.id, user.is_anonymous ? "trial" : "registered");
  void hydrateCardsFromServer();
}

function sendRegisteredDeviceToSignIn() {
  markRegistrationRequired();
  const path = window.location.pathname;
  if (path.startsWith("/register") || path.startsWith("/auth") || path.startsWith("/c/")) return;
  window.location.replace("/register?signin=1&expired=1");
}

/** Opens an anonymous Supabase session on a new device. Renders nothing. */
export function SupabaseSession() {
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      console.error("[supabase] missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
      markSessionBootstrapComplete();
      void hydrateCardsFromServer();
      return;
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
        if (existing.user) {
          acceptUser(existing.user);
          return;
        }

        if (existingError && existingError.name !== "AuthSessionMissingError") {
          console.error("[supabase] session check failed", existingError.message);
        }

        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
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
          return;
        }

        const { data, error } = await supabase.auth.signInAnonymously();
        if (error || !data.user) {
          console.error("[supabase] anonymous sign-in failed", error?.message ?? "no user");
          void hydrateCardsFromServer();
          return;
        }

        acceptUser(data.user);
      } finally {
        markSessionBootstrapComplete();
      }
    })();

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  return null;
}
