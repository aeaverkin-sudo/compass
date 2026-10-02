"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
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

  useEffect(() => {
    if (!hydrated || !sessionReady) return;
    if (needsSignIn) {
      router.replace("/register?expired=1");
      return;
    }
    if (!cardsReady) return;
    if (onboarded) {
      router.replace("/main");
      return;
    }
    if (trialCardStarted(cards)) {
      const user = useAppStore.getState().user;
      useAppStore.setState({ user: { ...user, onboarded: true } });
      router.replace("/main");
      return;
    }
    router.replace("/register");
  }, [hydrated, sessionReady, needsSignIn, cardsReady, onboarded, cards, router]);

  return <div className="h-lvh bg-background" aria-hidden />;
}
