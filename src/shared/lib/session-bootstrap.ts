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

export function getRegistrationRequired() {
  return registrationRequired;
}
