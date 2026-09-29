"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { MainScreen } from "@main/components/main-screen";
import { useRegistrationRequired, useSessionBootstrap } from "@/shared/hooks/use-session-bootstrap";
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
  const needsSignIn = useRegistrationRequired();
  const onboarded = useAppStore((state) => state.user.onboarded);

  useEffect(() => {
    applyMainChrome();
  }, []);

  useEffect(() => {
    if (!hydrated || !sessionReady) return;
    if (needsSignIn) {
      router.replace("/register?expired=1");
      return;
    }
    if (!onboarded) router.replace("/");
  }, [hydrated, sessionReady, needsSignIn, onboarded, router]);

  if (!hydrated || !sessionReady || needsSignIn || !onboarded) {
    return <div className="compass-main fixed inset-y-0 bg-background" aria-hidden />;
  }

  return <MainScreen />;
}
