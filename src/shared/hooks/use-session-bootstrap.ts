"use client";

import { useSyncExternalStore } from "react";
import {
  getLiveSession,
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

/** True when the auth check found a non-anonymous session. */
export function useLiveSession() {
  return useSyncExternalStore(subscribeSessionBootstrap, getLiveSession, () => false);
}

/** True when this device had a registered account and the session is gone. */
export function useRegistrationRequired() {
  return useSyncExternalStore(subscribeSessionBootstrap, getRegistrationRequired, () => false);
}
