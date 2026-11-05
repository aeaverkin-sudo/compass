import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;
let syncRefresh: (() => void) | null = null;

/** A card opened by the phone camera. This tab must not refresh the login. */
export function isCameraCardPath(path: string) {
  const pathname = path.split("?")[0]?.split("#")[0] ?? path;
  return pathname.startsWith("/c/") || pathname.startsWith("/@");
}

/** One browser client for the whole app. A new instance would drop the anonymous session. */
export function createBrowserSupabaseClient() {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  browserClient = createBrowserClient(url, anonKey);
  bindRefreshToVisibleTab(browserClient);
  return browserClient;
}

/**
 * One visible owner tab refreshes the cookie session. A hidden tab must not
 * refresh the same token later — Supabase treats that as reuse and revokes
 * the whole chain. A scanned card never refreshes. The check runs on every
 * sync, because this client is created once per tab.
 * src/proxy.ts rotates only on a full document load, inside the expiry margin.
 */
function bindRefreshToVisibleTab(client: SupabaseClient) {
  const sync = () => {
    if (isCameraCardPath(window.location.pathname)) {
      void client.auth.stopAutoRefresh();
      return;
    }
    if (document.visibilityState === "visible") void client.auth.startAutoRefresh();
    else void client.auth.stopAutoRefresh();
  };
  document.addEventListener("visibilitychange", sync);
  syncRefresh = sync;
  sync();
}

/** Call again when the route changes. A client move onto or off a scanned card starts or stops the refresh. */
export function syncBrowserRefresh() {
  syncRefresh?.();
}
