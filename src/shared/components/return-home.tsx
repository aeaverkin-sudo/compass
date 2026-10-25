"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { blockEditBriefly, cardShareHoldsPlace } from "@/shared/lib/card-share-guard";
import { useAppStore } from "@/shared/store/app-store";

const HOME_KEY = "aded-open-main";

/**
 * Leaving the app from any screen comes back to the first card.
 * A card share keeps that card.
 */
export function ReturnHome() {
  const router = useRouter();

  useEffect(() => {
    let left = false;

    const markLeft = () => {
      left = true;
      try {
        sessionStorage.setItem(HOME_KEY, "1");
      } catch {
        // Private mode. The live page still returns home.
      }
    };

    const clearLeft = () => {
      left = false;
      try {
        sessionStorage.removeItem(HOME_KEY);
      } catch {
        // The flag is only a hint for the next open.
      }
    };

    const home = () => {
      if (cardShareHoldsPlace()) {
        clearLeft();
        return;
      }
      let pending = left;
      if (!pending) {
        try {
          pending = sessionStorage.getItem(HOME_KEY) === "1";
        } catch {
          pending = false;
        }
      }
      if (!pending) return;
      clearLeft();
      blockEditBriefly();
      const { cards, currentCardIndex, setCurrentCardIndex } = useAppStore.getState();
      if (cards.length > 0 && currentCardIndex !== 0) setCurrentCardIndex(0);
      if (window.location.pathname !== "/main") router.replace("/main");
    };

    const onHide = () => {
      if (cardShareHoldsPlace()) return;
      markLeft();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") onHide();
      else home();
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) home();
    };

    home();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [router]);

  return null;
}
