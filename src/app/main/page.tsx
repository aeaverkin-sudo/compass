"use client";

import { useEffect, useLayoutEffect } from "react";
import { useRouter } from "next/navigation";
import { MainScreen } from "@main/components/main-screen";
import { ConsentRefresh } from "@/shared/components/consent-refresh";
import { ViewportDebug } from "./viewport-debug";
import { useCardsHydrated } from "@/shared/hooks/use-cards-hydrated";
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
  const cardsReady = useCardsHydrated();
  const onboarded = useAppStore((state) => state.user.onboarded);
  const hasCards = useAppStore((state) => state.cards.length > 0);
  // A returning device draws its stored cards at once; the session check and the server pull catch up behind.
  const cached = hydrated && onboarded && hasCards && !needsSignIn;

  useLayoutEffect(() => {
    applyMainChrome();
  }, []);

  // A client arrival from / replaces the status-bar color after the layout pass.
  useEffect(() => {
    applyMainChrome();
  }, []);

  useEffect(() => {
    if (!hydrated || !sessionReady) return;
    if (needsSignIn) {
      router.replace("/register?signin=1&expired=1");
      return;
    }
    if (!cardsReady) return;
    if (!onboarded) router.replace("/");
  }, [hydrated, sessionReady, needsSignIn, cardsReady, onboarded, router]);

  if (!cached && (!hydrated || !sessionReady || needsSignIn || !cardsReady || !onboarded)) {
    return (
      <>
        <div className="compass-main fixed inset-y-0 bg-background" aria-hidden />
        <ViewportDebug />
      </>
    );
  }

  return (
    <>
      <MainScreen />
      <ConsentRefresh />
      <ViewportDebug />
    </>
  );
}
