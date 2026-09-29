"use client";

import { useSyncExternalStore } from "react";
import {
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
