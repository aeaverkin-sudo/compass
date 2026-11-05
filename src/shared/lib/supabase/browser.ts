import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

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
 * One visible tab refreshes the cookie. A hidden tab must not: Supabase
 * treats a second use of the same refresh token as reuse and revokes the chain.
 * src/proxy.ts rotates only inside the expiry margin, and never on a card, Connect, or scan.
 */
function bindRefreshToVisibleTab(client: SupabaseClient) {
  const sync = () => {
    if (document.visibilityState === "visible") void client.auth.startAutoRefresh();
    else void client.auth.stopAutoRefresh();
  };
  document.addEventListener("visibilitychange", sync);
  sync();
}
