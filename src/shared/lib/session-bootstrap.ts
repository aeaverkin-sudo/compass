type Listener = () => void;

let ready = false;
let registrationRequired = false;
const listeners = new Set<Listener>();

/** Called once SupabaseSession finishes its first auth check. */
export function markSessionBootstrapComplete() {
  if (ready) return;
  ready = true;
  for (const listener of listeners) listener();
}

export function subscribeSessionBootstrap(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSessionBootstrapReady() {
  return ready;
}

/** A registered device lost its session. Do not open a new trial. */
export function markRegistrationRequired() {
  if (registrationRequired) return;
  registrationRequired = true;
  for (const listener of listeners) listener();
}

/** A registered session is in place. The expired-login flag must not survive a client navigation. */
export function clearRegistrationRequired() {
  if (!registrationRequired) return;
  registrationRequired = false;
  for (const listener of listeners) listener();
}

export function getRegistrationRequired() {
  return registrationRequired;
}

let ignoredSignedOut = 0;

/** The next SIGNED_OUT is ours (sign-out, or the local sign-out before a password sign-in). */
export function ignoreNextSignedOut() {
  ignoredSignedOut += 1;
}

export function consumeSignedOutIgnore() {
  if (ignoredSignedOut <= 0) return false;
  ignoredSignedOut -= 1;
  return true;
}

const OAUTH_REPLACE_LOCAL = "aded-oauth-replace-local";

/** Existing-account Google sign-in is about to leave the page. The trial stays until that session is real. */
export function markOAuthReplaceLocal() {
  try {
    sessionStorage.setItem(OAUTH_REPLACE_LOCAL, "1");
  } catch {
    /* storage unavailable */
  }
}

/** The Google redirect did not finish. Keep the trial. */
export function cancelOAuthReplaceLocal() {
  try {
    sessionStorage.removeItem(OAUTH_REPLACE_LOCAL);
  } catch {
    /* storage unavailable */
  }
}

/** A stored login whose user is gone. A missing session is not dead: that phone may still need Sign in. */
export function isDeadAuthSession(error: { name?: string; message?: string; code?: string } | null): boolean {
  if (!error || error.name === "AuthSessionMissingError" || error.name === "AuthRetryableFetchError") return false;
  const text = `${error.message ?? ""} ${error.code ?? ""}`.toLowerCase();
  if (text.includes("fetch") || text.includes("network") || text.includes("timeout")) return false;
  return (
    text.includes("does not exist") ||
    text.includes("user not found") ||
    text.includes("user_not_found") ||
    text.includes("invalid") ||
    text.includes("refresh") ||
    text.includes("jwt") ||
    text.includes("session_not_found") ||
    text.includes("bad_jwt")
  );
}

/** Drop a Supabase auth blob left behind by a deleted user. */
export function clearStoredAuthTokens() {
  try {
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // Private mode can block storage.
  }
}

/** True once, after a confirmed non-anonymous return. The trial must not merge into that account. */
export function consumeOAuthReplaceLocal() {
  try {
    if (sessionStorage.getItem(OAUTH_REPLACE_LOCAL) !== "1") return false;
    sessionStorage.removeItem(OAUTH_REPLACE_LOCAL);
    return true;
  } catch {
    return false;
  }
}
