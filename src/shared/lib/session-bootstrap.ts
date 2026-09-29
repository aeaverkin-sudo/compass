type Listener = () => void;

let ready = false;
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
