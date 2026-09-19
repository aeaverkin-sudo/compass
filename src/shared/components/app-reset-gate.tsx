"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStoreHydrated } from "@/shared/hooks/use-store-hydrated";
import { useAppStore } from "@/shared/store/app-store";

/** Clears persisted app data when the URL contains ?reset (e.g. /?reset=1). */
export function AppResetGate() {
  const router = useRouter();
  const hydrated = useStoreHydrated();

  useEffect(() => {
    if (!hydrated) return;

    const params = new URLSearchParams(window.location.search);
    if (!params.has("reset")) return;

    useAppStore.getState().resetApp();
    document.documentElement.classList.remove("compass-ready");
    router.replace("/");
  }, [hydrated, router]);

  return null;
}
