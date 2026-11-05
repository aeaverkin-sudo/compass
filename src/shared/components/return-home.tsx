"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { blockEditBriefly, cardShareHoldsPlace } from "@/shared/lib/card-share-guard";
import { readPortfolio, readQuestionnaire } from "@/shared/lib/fill-place";
import { useAppStore } from "@/shared/store/app-store";

const HOME_KEY = "aded-open-main";

/** A scanned card stays in its tab. Sleep and another tab must not replace it. */
function isPublicCard(path: string) {
  const pathname = path.split("?")[0]?.split("#")[0] ?? path;
  return pathname.startsWith("/c/") || pathname.startsWith("/@");
}

/** Doors and forms. A reload here is the person staying, not leaving the app. */
function isDoor(path: string) {
  const pathname = path.split("?")[0]?.split("#")[0] ?? path;
  if (pathname === "/register" || pathname.startsWith("/register/")) return true;
  if (pathname === "/create" || pathname.startsWith("/create/")) return true;
  if (pathname === "/open" || pathname === "/handoff") return true;
  if (pathname === "/auth" || pathname.startsWith("/auth/")) return true;
  if (pathname === "/save" || pathname.startsWith("/save/")) return true;
  if (pathname === "/wallet/add" || pathname.startsWith("/wallet/add/")) return true;
  return false;
}

function navigationType() {
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return nav?.type;
}

/**
 * Leaving the app from the owner's own screen comes back to the first card.
 * A card share keeps that card. A scanned card is left where it was opened.
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

    const cameFromHere = () => {
      const kind = navigationType();
      if (kind !== "navigate" && kind !== "reload" && kind !== "back_forward") return false;
      try {
        return new URL(document.referrer).origin === window.location.origin;
      } catch {
        return false;
      }
    };

    const home = (resume: boolean) => {
      if (isPublicCard(window.location.pathname) || isDoor(window.location.pathname)) {
        clearLeft();
        return;
      }
      if (!resume) {
        const kind = navigationType();
        // A reload or the back button is not leaving the app. Coming back
        // from the background still is, and that path passes resume.
        if (kind === "reload" || kind === "back_forward" || cameFromHere()) {
          clearLeft();
          return;
        }
      }
      if (cardShareHoldsPlace()) {
        clearLeft();
        return;
      }
      const path = window.location.pathname;
      if ((path === "/" || path === "/create") && readQuestionnaire()) {
        clearLeft();
        return;
      }
      if ((path === "/" || path === "/main") && readPortfolio()) {
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
      if (cardShareHoldsPlace() || isPublicCard(window.location.pathname) || isDoor(window.location.pathname)) return;
      markLeft();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") onHide();
      else home(true);
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) home(true);
    };

    home(false);
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
