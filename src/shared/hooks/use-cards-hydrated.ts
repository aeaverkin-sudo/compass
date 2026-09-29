"use client";

import { useSyncExternalStore } from "react";
import { getCardsHydrated, subscribeCardsHydrated } from "@/shared/services/card-sync";

/** True once a server card pull has finished. */
export function useCardsHydrated() {
  return useSyncExternalStore(subscribeCardsHydrated, getCardsHydrated, () => false);
}
