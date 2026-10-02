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
