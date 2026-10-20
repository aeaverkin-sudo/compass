"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LiveCardLanding } from "@landing/components/live-card-landing";
import { useCardsHydrated } from "@/shared/hooks/use-cards-hydrated";
import { useRegistrationRequired, useSessionBootstrap } from "@/shared/hooks/use-session-bootstrap";
import { useStoreHydrated } from "@/shared/hooks/use-store-hydrated";
import { useAppStore } from "@/shared/store/app-store";

export default function Home() {
  const router = useRouter();
  const hydrated = useStoreHydrated();
  const sessionReady = useSessionBootstrap();
  const needsSignIn = useRegistrationRequired();
  const cardsReady = useCardsHydrated();
  const onboarded = useAppStore((state) => state.user.onboarded);
  const landing = hydrated && sessionReady && !needsSignIn && cardsReady && !onboarded;

  useEffect(() => {
    if (hydrated && onboarded && !needsSignIn) {
      router.replace("/main");
      return;
    }
    if (!hydrated || !sessionReady) return;
    if (needsSignIn) {
      router.replace("/register?signin=1&expired=1");
      return;
    }
    if (!cardsReady) return;
    if (onboarded) {
      router.replace("/main");
    }
  }, [hydrated, sessionReady, needsSignIn, cardsReady, onboarded, router]);

  if (landing) return <LiveCardLanding />;
  return <div className="h-svh bg-white" aria-hidden />;
}
