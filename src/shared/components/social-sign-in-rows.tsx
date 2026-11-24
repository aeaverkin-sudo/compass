"use client";

import { useEffect, useState } from "react";
import { doorNext } from "@/app/create/door";
import { cn } from "@/lib/utils";
import { clearGooglePending, markGooglePending, socialSignInBlocked, track } from "@/shared/lib/funnel";
import { photoSlotLookClass } from "@/shared/lib/photo-look";
import { cancelOAuthReplaceLocal, markOAuthReplaceLocal } from "@/shared/lib/session-bootstrap";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";

const GOOGLE_ICON_PX = 18;
/** The Apple file is the width of the mark slot. The Google mark sits in the same slot, so both words start together. */
const MARK_SLOT_PX = 31;
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
  query.set("provider", provider);
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

const ROW = cn(
  "press flex min-h-11 w-full items-center border-0 bg-white p-0 text-left t-body text-[var(--ink)] [-webkit-tap-highlight-color:transparent]",
  photoSlotLookClass("shadow"),
);

/** Sign-in buttons in the value column. The left edge is the axis; the mark stays inside the button. */
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
    <div className="flex flex-col gap-[14px]">
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
          className="shrink-0"
          style={{ width: MARK_SLOT_PX, height: APPLE_FILE_H }}
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
          <span className="flex h-11 shrink-0 items-center justify-center" style={{ width: MARK_SLOT_PX }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/google-g.svg"
              alt=""
              aria-hidden
              style={{ width: GOOGLE_ICON_PX, height: GOOGLE_ICON_PX }}
            />
          </span>
          Continue with Google
        </button>
      ) : null}
    </div>
  );
}
