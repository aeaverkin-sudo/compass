"use client";

import { useEffect, useState } from "react";
import { doorNext } from "@/app/create/door";
import { clearGooglePending, markGooglePending, socialSignInBlocked, track } from "@/shared/lib/funnel";
import { cancelOAuthReplaceLocal, markOAuthReplaceLocal } from "@/shared/lib/session-bootstrap";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";

const ICON_GAP_PX = 8;
const GOOGLE_ICON_PX = 18;

export type SocialFrom = "create" | "signin";

/** Leaves for Google. The return lands on `/auth/callback` with the same door. */
export function startGoogleSignIn(from: SocialFrom, next?: string | null) {
  track("google_start");
  markGooglePending();
  markOAuthReplaceLocal();
  const query = new URLSearchParams();
  query.set("from", from);
  const safe = next ? doorNext(next) : undefined;
  if (safe) query.set("next", safe);
  const redirectTo = `${window.location.origin}/auth/callback?${query.toString()}`;
  const failed = () => {
    clearGooglePending();
    cancelOAuthReplaceLocal();
    track("google_fail");
  };
  void createBrowserSupabaseClient()
    .auth.signInWithOAuth({ provider: "google", options: { redirectTo } })
    .then(({ error }) => {
      if (error) failed();
    })
    .catch(() => {
      failed();
    });
}

/** Sign-in rows in the value column. The mark sits left of the axis, the words on it. */
export function SocialSignInRows({ from, next }: { from: SocialFrom; next?: string | null }) {
  const enabled = process.env.NEXT_PUBLIC_SOCIAL_SIGNIN === "1";
  const [google, setGoogle] = useState(false);

  useEffect(() => {
    cancelOAuthReplaceLocal();
  }, []);

  useEffect(() => {
    if (!enabled || socialSignInBlocked()) return;
    const id = window.setTimeout(() => setGoogle(true), 0);
    return () => window.clearTimeout(id);
  }, [enabled]);

  if (!google) return null;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-label="Continue with Google"
        onClick={() => startGoogleSignIn(from, next)}
        className="press relative flex min-h-11 w-full items-center border-0 bg-transparent p-0 text-left t-body text-[var(--ink)] [-webkit-tap-highlight-color:transparent]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/google-g.svg"
          alt=""
          aria-hidden
          className="absolute top-1/2 -translate-y-1/2"
          style={{ right: `calc(100% + ${ICON_GAP_PX}px)`, width: GOOGLE_ICON_PX, height: GOOGLE_ICON_PX }}
        />
        Continue with Google
      </button>
    </div>
  );
}
