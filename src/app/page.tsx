"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PosterWallLanding } from "@landing/components/poster-wall-landing";
import { useCardsHydrated } from "@/shared/hooks/use-cards-hydrated";
import { useRegistrationRequired, useSessionBootstrap } from "@/shared/hooks/use-session-bootstrap";
import { useStoreHydrated } from "@/shared/hooks/use-store-hydrated";
import { homeEntryHref, isInstalledApp, noteTrialCardStarted } from "@/shared/lib/home-entry";
import { useAppStore } from "@/shared/store/app-store";

export default function Home() {
  const router = useRouter();
  const hydrated = useStoreHydrated();
  const sessionReady = useSessionBootstrap();
  const needsSignIn = useRegistrationRequired();
  const cardsReady = useCardsHydrated();
  const onboarded = useAppStore((state) => state.user.onboarded);
  const cards = useAppStore((state) => state.cards);
  const [installed, setInstalled] = useState<boolean | null>(null);
  const gate = { hydrated, sessionReady, cardsReady, needsSignIn, onboarded, cards };

  useEffect(() => {
    setInstalled(isInstalledApp());
  }, []);

  useEffect(() => {
    if (installed !== true) return;
    const href = homeEntryHref({ hydrated, sessionReady, cardsReady, needsSignIn, onboarded, cards });
    if (!href || href === "/create") return;
    if (href === "/main") noteTrialCardStarted();
    router.replace(href);
  }, [installed, hydrated, sessionReady, cardsReady, needsSignIn, onboarded, cards, router]);

  if (installed === false) return <PosterWallLanding />;
  if (installed === true && homeEntryHref(gate) === "/create") return <PosterWallLanding />;
  return <div className="fixed inset-0 bg-white" aria-hidden />;
}
