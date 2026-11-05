import "server-only";

import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { matchesStoredToken, welcomeTokenHash } from "@/shared/services/welcome-token";

const TOKEN_RE = /^[A-Za-z0-9_-]{43,128}$/;
const LIFE_MS = 10 * 60 * 1000;

/** Replaces the previous link. The letter token is a different column and stays. */
export async function saveBrowserLink(userId: string, token: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  const saved = await admin
    .from("profiles")
    .update({
      browser_link_hash: welcomeTokenHash(token),
      browser_link_expires_at: new Date(Date.now() + LIFE_MS).toISOString(),
      browser_link_used_at: null,
    })
    .eq("id", userId);
  if (saved.error) throw new Error(saved.error.message);
}

export type BrowserDoor = { kind: "open"; email: string } | { kind: "signin"; email?: string };

/**
 * One opening. A second visit, or a visit after ten minutes, names the email
 * and does not sign in. A replaced link no longer matches a row.
 */
export async function claimBrowserLink(token: string): Promise<BrowserDoor> {
  if (!TOKEN_RE.test(token)) return { kind: "signin" };
  const admin = createAdminSupabaseClient();
  const hash = welcomeTokenHash(token);
  const row = await admin
    .from("profiles")
    .select("id, browser_link_hash, browser_link_expires_at, browser_link_used_at")
    .eq("browser_link_hash", hash)
    .maybeSingle();
  if (row.error) {
    if (/browser_link_/i.test(row.error.message)) return { kind: "signin" };
    throw new Error(row.error.message);
  }
  const data = row.data as {
    id: string;
    browser_link_hash: string | null;
    browser_link_expires_at: string | null;
    browser_link_used_at: string | null;
  } | null;
  if (!data?.browser_link_hash || !matchesStoredToken(data.browser_link_hash, token)) return { kind: "signin" };

  const user = (await admin.auth.admin.getUserById(data.id)).data.user;
  const email = user?.email?.trim().toLowerCase() || undefined;
  const expired = !data.browser_link_expires_at || Date.parse(data.browser_link_expires_at) <= Date.now();
  if (!email || data.browser_link_used_at || expired) return { kind: "signin", email };

  const claimed = await admin
    .from("profiles")
    .update({ browser_link_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .eq("browser_link_hash", hash)
    .is("browser_link_used_at", null)
    .gt("browser_link_expires_at", new Date().toISOString())
    .select("id");
  if (claimed.error) throw new Error(claimed.error.message);
  if (!claimed.data?.length) return { kind: "signin", email };
  return { kind: "open", email };
}
