"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { MainScreen } from "@main/components/main-screen";
import { useSessionBootstrap } from "@/shared/hooks/use-session-bootstrap";
import { useStoreHydrated } from "@/shared/hooks/use-store-hydrated";
import { useAppStore } from "@/shared/store/app-store";

function applyMainChrome() {
  document.documentElement.classList.add("compass-ready");

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", "#c5e8f7");
  }
}

export default function MainPage() {
  const router = useRouter();
  const hydrated = useStoreHydrated();
  const sessionReady = useSessionBootstrap();
  const onboarded = useAppStore((state) => state.user.onboarded);

  useEffect(() => {
    applyMainChrome();
  }, []);

  useEffect(() => {
    if (hydrated && sessionReady && !onboarded) {
      router.replace("/");
    }
  }, [hydrated, sessionReady, onboarded, router]);

  if (!hydrated || !sessionReady || !onboarded) {
    return <div className="fixed inset-0 bg-background" aria-hidden />;
  }

  return <MainScreen />;
}
