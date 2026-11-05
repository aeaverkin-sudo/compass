"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCardsHydrated } from "@/shared/hooks/use-cards-hydrated";
import { useSessionBootstrap } from "@/shared/hooks/use-session-bootstrap";
import { useStoreHydrated } from "@/shared/hooks/use-store-hydrated";
import { readPortfolio, readQuestionnaire } from "@/shared/lib/fill-place";
import { useAppStore } from "@/shared/store/app-store";

/** A killed page opens again on the questionnaire or the card that was being edited. */
export function FillPlaceResume() {
  const router = useRouter();
  const hydrated = useStoreHydrated();
  const sessionReady = useSessionBootstrap();
  const cardsReady = useCardsHydrated();

  useEffect(() => {
    if (!hydrated) return;
    const form = readQuestionnaire();
    const path = window.location.pathname;
    if (form && (path === "/" || path === "/main")) {
      if (!sessionReady || !cardsReady) return;
      const state = useAppStore.getState();
      const registered =
        state.user.onboarded || state.cards.some((card) => card.displayName.trim().length > 0);
      if (!registered) {
        router.replace(form.href);
        return;
      }
    }
    const edit = readPortfolio();
    if (!edit) return;
    const index = useAppStore.getState().cards.findIndex((card) => card.id === edit.cardId);
    if (index < 0) return;
    if (useAppStore.getState().currentCardIndex !== index) {
      useAppStore.getState().setCurrentCardIndex(index);
    }
    if (path === "/") router.replace("/main");
  }, [hydrated, sessionReady, cardsReady, router]);

  return null;
}
