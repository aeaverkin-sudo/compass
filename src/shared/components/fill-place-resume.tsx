"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStoreHydrated } from "@/shared/hooks/use-store-hydrated";
import { readPortfolio, readQuestionnaire } from "@/shared/lib/fill-place";
import { useAppStore } from "@/shared/store/app-store";

/** A killed page opens again on the questionnaire or the card that was being edited. */
export function FillPlaceResume() {
  const router = useRouter();
  const hydrated = useStoreHydrated();

  useEffect(() => {
    if (!hydrated) return;
    const form = readQuestionnaire();
    const path = window.location.pathname;
    if (form && (path === "/" || path === "/main")) {
      router.replace(form.href);
      return;
    }
    const edit = readPortfolio();
    if (!edit) return;
    const index = useAppStore.getState().cards.findIndex((card) => card.id === edit.cardId);
    if (index < 0) return;
    if (useAppStore.getState().currentCardIndex !== index) {
      useAppStore.getState().setCurrentCardIndex(index);
    }
    if (path === "/") router.replace("/main");
  }, [hydrated, router]);

  return null;
}
