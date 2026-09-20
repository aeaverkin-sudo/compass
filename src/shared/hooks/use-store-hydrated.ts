"use client";

import { useSyncExternalStore } from "react";
import { useAppStore } from "@/shared/store/app-store";

/** True once the persisted store has finished rehydrating from localStorage. */
export function useStoreHydrated() {
  return useSyncExternalStore(
    (onChange) => useAppStore.persist.onFinishHydration(onChange),
    () => useAppStore.persist.hasHydrated(),
    () => false,
  );
}
