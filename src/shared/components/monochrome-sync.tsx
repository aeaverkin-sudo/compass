"use client";

import { useEffect } from "react";
import { useAppStore } from "@/shared/store/app-store";

/** Applies the gray interface. Photos are not filtered, so they stay in color. */
export function MonochromeSync() {
  const monochrome = useAppStore((state) => state.user.monochrome);

  useEffect(() => {
    document.documentElement.classList.toggle("compass-mono", Boolean(monochrome));
  }, [monochrome]);

  return null;
}
