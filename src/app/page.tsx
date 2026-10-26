"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PosterWallLanding } from "@landing/components/poster-wall-landing";
import { useCardsHydrated } from "@/shared/hooks/use-cards-hydrated";
import { useRegistrationRequired, useSessionBootstrap } from "@/shared/hooks/use-session-bootstrap";
import { useStoreHydrated } from "@/shared/hooks/use-store-hydrated";
import { useAppStore } from "@/shared/store/app-store";
import type { Card } from "@/shared/types";

/** A trial card already has a name or a photo, even if onboarding was not flipped. */
function trialCardStarted(cards: Card[]) {
  return cards.some(
    (card) => card.displayName.trim().length > 0 || Boolean(card.photo) || Boolean(card.photoAttachmentId),
  );
}

export default function Home() {
  const router = useRouter();
  const hydrated = useStoreHydrated();
  const sessionReady = useSessionBootstrap();
  const needsSignIn = useRegistrationRequired();
  const cardsReady = useCardsHydrated();
  const onboarded = useAppStore((state) => state.user.onboarded);
  const cards = useAppStore((state) => state.cards);
  const landing =
    hydrated &&
    sessionReady &&
    cardsReady &&
    (needsSignIn || (!onboarded && !trialCardStarted(cards)));

  useEffect(() => {
    if (!hydrated || !sessionReady || needsSignIn) return;
    if (onboarded) {
      router.replace("/main");
      return;
    }
    if (!cardsReady) return;
    if (trialCardStarted(cards)) {
      const user = useAppStore.getState().user;
      useAppStore.setState({ user: { ...user, onboarded: true } });
      router.replace("/main");
    }
  }, [hydrated, sessionReady, needsSignIn, cardsReady, onboarded, cards, router]);

  if (landing) return <PosterWallLanding />;
  return <div className="fixed inset-0 bg-white" aria-hidden />;
}
