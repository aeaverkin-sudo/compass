const listeners = new Set<() => void>();

/** The visible edit list handles the plate's Field button. */
export function subscribeEditComposer(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function requestEditComposer() {
  listeners.forEach((listener) => listener());
}
