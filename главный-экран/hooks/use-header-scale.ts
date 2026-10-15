"use client";

import { useSyncExternalStore } from "react";
import { readHeaderScale } from "../layout";

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
  };
}

/** The compact or comfortable header scale the screen measure wrote on :root. */
export function useHeaderScale() {
  return useSyncExternalStore(subscribe, readHeaderScale, () => 1);
}
