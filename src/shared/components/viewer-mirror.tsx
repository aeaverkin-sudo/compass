"use client";

import { useEffect } from "react";
import { VIEWER_COOKIE } from "@/shared/lib/viewer";

const FUNNEL_KEY = "aded-funnel";
const OAUTH_MARK = "aded-google-pending";

/** Drop the old visit counter. Sign-in cookies, settings and drafts stay. */
export function ViewerMirror() {
  useEffect(() => {
    try {
      localStorage.removeItem(VIEWER_COOKIE);
    } catch {
      // Storage can be closed. The cookie clear below still runs.
    }
    try {
      sessionStorage.removeItem(FUNNEL_KEY);
      sessionStorage.removeItem(OAUTH_MARK);
    } catch {
      // A private tab may have nothing stored.
    }
    document.cookie = `${VIEWER_COOKIE}=; path=/; max-age=0; samesite=lax`;
  }, []);
  return null;
}
