"use client";

import { useCallback, useRef, useState } from "react";

/**
 * One action at a time. The key of the running action is set before the first await,
 * so its button greys out and says «…ing» on the same tap; a second tap returns undefined.
 */
export function useBusyAction<K extends string = string>() {
  const lock = useRef(false);
  const [busy, setBusy] = useState<K | null>(null);

  const run = useCallback(async <T>(key: K, work: () => Promise<T>): Promise<T | undefined> => {
    if (lock.current) return undefined;
    lock.current = true;
    setBusy(key);
    try {
      return await work();
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }, []);

  return { busy, run };
}
