"use client";

import { useEffect, useState } from "react";
import { doorNext } from "@/app/create/door";
import { clearGooglePending, markGooglePending, socialSignInBlocked, track } from "@/shared/lib/funnel";
import { cancelOAuthReplaceLocal, markOAuthReplaceLocal } from "@/shared/lib/session-bootstrap";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";

const ICON_GAP_PX = 8;
const GOOGLE_ICON_PX = 18;
/** The Apple file carries its own side space. Its right edge on the axis leaves the mark about 8px off it. */
const APPLE_FILE_W = 31;
const APPLE_FILE_H = 44;

export type SocialFrom = "create" | "signin";
type SocialProvider = "google" | "apple";

/** Leaves for Google or Apple. The return lands on `/auth/callback` with the same door. */
function startSocialSignIn(provider: SocialProvider, from: SocialFrom, next?: string | null) {
  track(provider === "apple" ? "apple_start" : "google_start");
  markGooglePending(provider);
  markOAuthReplaceLocal();
  const query = new URLSearchParams();
  query.set("from", from);
  const safe = next ? doorNext(next) : undefined;
  if (safe) query.set("next", safe);
  const redirectTo = `${window.location.origin}/auth/callback?${query.toString()}`;
  const failed = () => {
    clearGooglePending();
    cancelOAuthReplaceLocal();
    track(provider === "apple" ? "apple_fail" : "google_fail");
  };
  void createBrowserSupabaseClient()
    .auth.signInWithOAuth({ provider, options: { redirectTo } })
    .then(({ error }) => {
      if (error) failed();
    })
    .catch(() => {
      failed();
    });
}

export function startGoogleSignIn(from: SocialFrom, next?: string | null) {
  startSocialSignIn("google", from, next);
}

export const SOCIAL_SIGNIN = process.env.NEXT_PUBLIC_SOCIAL_SIGNIN === "1";

/** A 44px row around one `t-body` line. Pulling it up by this puts the line on the zone top, like a questionnaire value. */
export const ROW_LINE_TRIM = "calc((15.5px * 1.45 - 44px) / 2)";

const ROW =
  "press relative flex min-h-11 w-full items-center border-0 bg-transparent p-0 text-left t-body text-[var(--ink)] [-webkit-tap-highlight-color:transparent]";

/** Sign-in rows in the value column. The mark sits left of the axis, the words on it. */
export function SocialSignInRows({ from, next }: { from: SocialFrom; next?: string | null }) {
  const enabled = SOCIAL_SIGNIN;
  const [google, setGoogle] = useState(false);

  useEffect(() => {
    cancelOAuthReplaceLocal();
  }, []);

  useEffect(() => {
    if (!enabled || socialSignInBlocked()) return;
    const id = window.setTimeout(() => setGoogle(true), 0);
    return () => window.clearTimeout(id);
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className="flex flex-col" style={{ marginTop: ROW_LINE_TRIM }}>
      <button
        type="button"
        aria-label="Continue with Apple"
        onClick={() => startSocialSignIn("apple", from, next)}
        className={ROW}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/apple-logo.svg"
          alt=""
          aria-hidden
          className="absolute top-1/2 right-full -translate-y-1/2"
          style={{ width: APPLE_FILE_W, height: APPLE_FILE_H }}
        />
        Continue with Apple
      </button>
      {google ? (
        <button
          type="button"
          aria-label="Continue with Google"
          onClick={() => startGoogleSignIn(from, next)}
          className={ROW}
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
      ) : null}
    </div>
  );
}
