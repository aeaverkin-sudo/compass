"use client";

import { useSyncExternalStore } from "react";
import {
  getRegistrationRequired,
  getSessionBootstrapReady,
  subscribeSessionBootstrap,
} from "@/shared/lib/session-bootstrap";

/** True once the first Supabase auth check has finished. */
export function useSessionBootstrap() {
  return useSyncExternalStore(
    subscribeSessionBootstrap,
    getSessionBootstrapReady,
    () => false,
  );
}

/** True when this device had a registered account and the session is gone. */
export function useRegistrationRequired() {
  return useSyncExternalStore(subscribeSessionBootstrap, getRegistrationRequired, () => false);
}
