import { combineChunks, stringFromBase64URL } from "@supabase/ssr";

const PREFIX = "base64-";

/**
 * auth-js refreshes when the access token is inside this window
 * (3 ticks × 30s). A second caller in the same window revokes the chain.
 */
export const REFRESH_WINDOW_MS = 90_000;

type StoredSession = { access_token?: string; expires_at?: number };

/** Same key the browser client writes. `sb-<project-ref>-auth-token`. */
export function authStorageKey(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    const ref = new URL(url).hostname.split(".")[0];
    return ref ? `sb-${ref}-auth-token` : null;
  } catch {
    return null;
  }
}

async function readStoredSession(all: { name: string; value: string }[]): Promise<StoredSession | null> {
  const key = authStorageKey();
  if (!key) return null;
  const map = new Map(all.map((entry) => [entry.name, entry.value]));
  const raw = await combineChunks(key, (name) => map.get(name) ?? null);
  if (!raw) return null;
  let json = raw;
  if (raw.startsWith(PREFIX)) {
    try {
      json = stringFromBase64URL(raw.slice(PREFIX.length));
    } catch {
      return null;
    }
  }
  try {
    const parsed = JSON.parse(json) as StoredSession;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Access token that has not actually expired. Reading it does not rotate the refresh token. */
export async function readStoredAccessToken(all: { name: string; value: string }[]): Promise<string | null> {
  const session = await readStoredSession(all);
  if (!session?.access_token || !session.expires_at) return null;
  if (session.expires_at * 1000 <= Date.now()) return null;
  return session.access_token;
}

/** True only when `getUser()` would call the refresh endpoint. A fresh token must be left alone. */
export async function storedSessionNeedsRefresh(all: { name: string; value: string }[]): Promise<boolean> {
  const session = await readStoredSession(all);
  if (!session?.expires_at) return false;
  return session.expires_at * 1000 - Date.now() < REFRESH_WINDOW_MS;
}
