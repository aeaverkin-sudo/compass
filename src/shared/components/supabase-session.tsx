"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isAuthRetryableFetchError } from "@supabase/auth-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createBrowserSupabaseClient, isCameraCardPath, syncBrowserRefresh } from "@/shared/lib/supabase/browser";
import {
  clearRegisteredDevice,
  deviceWasRegistered,
  markRegisteredDevice,
  rememberAccountEmail,
  signInPath,
} from "@/shared/lib/registered-device";
import {
  clearRegistrationRequired,
  clearStoredAuthTokens,
  consumeSignedOutIgnore,
  ignoreNextSignedOut,
  isDeadAuthSession,
  markRegistrationRequired,
  markSessionBootstrapComplete,
} from "@/shared/lib/session-bootstrap";
import { hydrateCardsFromServer } from "@/shared/services/card-sync";
import { clearFillPlace, readQuestionnaire } from "@/shared/lib/fill-place";
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

/** A named card means the questionnaire is finished. The portfolio draft stays. */
function dropFinishedQuestionnaire() {
  const hasCard = useAppStore.getState().cards.some((card) => card.displayName.trim().length > 0);
  if (!hasCard || !readQuestionnaire()) return;
  clearFillPlace();
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
    if (user.app_metadata?.event_trial !== true) markRegisteredDevice();
    if (user.email) rememberAccountEmail(user.email);
    clearRegistrationRequired();
  }
  restoreRegisteredOnboarding(Boolean(user.is_anonymous));
  console.info("[supabase] session", user.id, user.is_anonymous ? "trial" : "registered");
  if (!user.is_anonymous) dropFinishedQuestionnaire();
  // The portfolio paints from the cards already on the phone. The pull catches up after.
  void hydrateCardsFromServer().then(() => {
    if (!user.is_anonymous) dropFinishedQuestionnaire();
  });
}

/** A dead session sends the owner to sign-in only from a working screen. A public card stays open. */
function isOwnerRoute(path: string) {
  const pathname = path.split("?")[0]?.split("#")[0] ?? path;
  if (pathname === "/main" || pathname.startsWith("/main/")) return true;
  if (pathname === "/profile" || pathname.startsWith("/profile/")) return true;
  if (pathname === "/account" || pathname.startsWith("/account/")) return true;
  if (/^\/e\/[^/]+\/manage(?:\/|$)/.test(pathname)) return true;
  if (pathname === "/network/c" || pathname.startsWith("/network/c/")) return false;
  if (pathname === "/network" || pathname.startsWith("/network/")) return true;
  return false;
}

function sendRegisteredDeviceToSignIn() {
  markRegistrationRequired();
  if (!isOwnerRoute(window.location.pathname)) return;
  window.location.replace(signInPath({ expired: true }));
}

/** The stored user is gone. A fresh trial must not be treated as a lost login. */
async function startFreshAnonymous(supabase: SupabaseClient) {
  clearRegisteredDevice();
  clearRegistrationRequired();
  ignoreNextSignedOut();
  await supabase.auth.signOut({ scope: "local" });
  clearStoredAuthTokens();
  await openAnonymous(supabase);
}

async function openAnonymous(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    console.error("[supabase] anonymous sign-in failed", error?.message ?? "no user");
    void hydrateCardsFromServer();
    return;
  }
  acceptUser(data.user);
}

/** A card opened by the phone camera. The Safari or Chrome tab already holds the login. This page must not refresh it, sign it out, or replace it with a trial. */
function isCameraCard(path: string) {
  return isCameraCardPath(path);
}

/** Opens an anonymous Supabase session on a new device. Renders nothing. */
export function SupabaseSession() {
  const pathname = usePathname();

  useEffect(() => {
    syncBrowserRefresh();
  }, [pathname]);

  useEffect(() => {
    if (isCameraCard(window.location.pathname)) {
      markSessionBootstrapComplete();
      return;
    }

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
        if (isDeadAuthSession(existingError)) {
          console.info("[supabase] dead session");
          await startFreshAnonymous(supabase);
          return;
        }
        if (existing.user) {
          acceptUser(existing.user);
          return;
        }

        if (
          existingError &&
          (isAuthRetryableFetchError(existingError) ||
            (existingError.status ?? 0) >= 500 ||
            existingError.status === 429)
        ) {
          console.error("[supabase] session check failed, keeping the stored login", existingError.message);
          return;
        }

        if (existingError && existingError.name !== "AuthSessionMissingError") {
          console.error("[supabase] session check failed", existingError.message);
        }

        // Do not call refreshSession() here. getUser already refreshes inside
        // the expiry margin, and a second rotation revokes the login.
        if (deviceWasRegistered()) {
          console.info("[supabase] registered device, session missing");
          sendRegisteredDeviceToSignIn();
          return;
        }

        await openAnonymous(supabase);
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
