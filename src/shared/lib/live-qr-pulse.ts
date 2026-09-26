type LiveQrPulseListener = (cardId: string) => void;

const listeners = new Set<LiveQrPulseListener>();
let armed = false;

/** Call after the first server hydrate so load/migrate do not breathe the QR. */
export function armLiveQrPulse() {
  armed = true;
}

export function requestLiveQrPulse(cardId: string) {
  if (!armed || typeof window === "undefined" || !cardId) return;
  listeners.forEach((listener) => listener(cardId));
}

export function subscribeLiveQrPulse(listener: LiveQrPulseListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
