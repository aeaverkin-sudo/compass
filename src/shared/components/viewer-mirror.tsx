"use client";

import { useEffect } from "react";
import { VIEWER_COOKIE, viewerId } from "@/shared/lib/viewer";

const YEAR_SECONDS = 60 * 60 * 24 * 400;

/** Keep the same anonymous id in localStorage when the cookie is already set. */
export function ViewerMirror() {
  useEffect(() => {
    const fromCookie = viewerId(
      document.cookie
        .split("; ")
        .find((part) => part.startsWith(`${VIEWER_COOKIE}=`))
        ?.slice(VIEWER_COOKIE.length + 1),
    );
    if (fromCookie) {
      localStorage.setItem(VIEWER_COOKIE, fromCookie);
      return;
    }
    const stored = viewerId(localStorage.getItem(VIEWER_COOKIE));
    if (!stored) return;
    document.cookie = `${VIEWER_COOKIE}=${stored}; path=/; max-age=${YEAR_SECONDS}; samesite=lax`;
  }, []);
  return null;
}
