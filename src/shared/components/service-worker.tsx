"use client";

import { useEffect } from "react";

export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const build = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
    const register = () =>
      void navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(build)}`).catch(() => undefined);
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
