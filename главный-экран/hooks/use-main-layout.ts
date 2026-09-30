"use client";

import { useLayoutEffect, useState } from "react";
import {
  browseBandHeightPx,
  libraryCardHeightPx,
  librarySheetTopPx,
  libraryStackTopPx,
  BOTTOM_PLATE_DROP_PX,
  BOTTOM_PLATE_LOWER_PX,
  BROWSE_QR_SIZE,
  HEADER_RHYTHM_PX,
  RULE_GAP_PX,
  SHEET_INSET,
  TOP_VEIL_PX,
} from "../layout";

export type MainLayout = {
  qrTop: number;
  cardTopBrowse: number;
  cardTopLibrary: number;
  cardBottomBrowse: number;
  browseMenuCenterY: number;
  sheetTopBrowse: number;
  sheetTopLibrary: number;
  edgeInsetBrowse: number;
  edgeInsetLibrary: number;
  browseCardHeight: number;
  libraryCardHeight: number;
  bandHeight: number;
};

function readSafeAreaInset(edge: "top" | "bottom") {
  if (typeof document === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  if (edge === "top") probe.style.paddingTop = "env(safe-area-inset-top)";
  else probe.style.paddingBottom = "env(safe-area-inset-bottom)";
  document.documentElement.appendChild(probe);
  const size = probe.getBoundingClientRect().height;
  document.documentElement.removeChild(probe);
  return size;
}

/** `svh` is the visible height. `lvh` is the large viewport. */
function readViewport(unit: "svh" | "lvh") {
  const probe = document.createElement("div");
  probe.style.cssText = `position:fixed;top:0;height:100${unit};visibility:hidden;pointer-events:none`;
  document.documentElement.appendChild(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return height || window.innerHeight;
}

/**
 * One screen height for this phone, in CSS pixels.
 * Safari's `lvh` can be the short viewport while the home-screen app reports the whole screen,
 * so a leftover band grows only there. `screen.height` does not. A desktop monitor is not the page.
 */
function readFullScreen() {
  const lvh = readViewport("lvh");
  const svh = readViewport("svh");
  const screenH = window.screen?.height || 0;
  const page = Math.max(lvh, svh);
  if (screenH > 0 && Math.abs(screenH - page) <= 180) return screenH;
  return lvh || page;
}

function computeLayout(): MainLayout | null {
  if (typeof window === "undefined") return null;

  const visibleH = readViewport("svh");
  const fullH = readFullScreen();
  const safeTop = readSafeAreaInset("top");
  const visibleBottom = visibleH;
  const qrTop = safeTop + HEADER_RHYTHM_PX;
  const cardTopBrowse = safeTop + HEADER_RHYTHM_PX + BROWSE_QR_SIZE + RULE_GAP_PX;
  const bandH = Math.max(0, Math.round(browseBandHeightPx(fullH)));
  const cardBottomBrowse = visibleH - bandH - BOTTOM_PLATE_LOWER_PX - TOP_VEIL_PX;
  const browseHeight = cardBottomBrowse - cardTopBrowse;
  const libraryHeight = libraryCardHeightPx(visibleH, safeTop);
  const browseMenuCenterY = (cardBottomBrowse + visibleBottom) / 2 + BOTTOM_PLATE_DROP_PX;
  const sheetTopBrowse = cardBottomBrowse - SHEET_INSET.browse.overlap;
  const cardTopLibrary = libraryStackTopPx(safeTop);
  const sheetTopLibrary = librarySheetTopPx(visibleH, safeTop);

  return {
    qrTop,
    cardTopBrowse,
    cardTopLibrary,
    cardBottomBrowse,
    browseMenuCenterY,
    sheetTopBrowse,
    sheetTopLibrary,
    edgeInsetBrowse: SHEET_INSET.browse.horizontal,
    edgeInsetLibrary: SHEET_INSET.library.horizontal,
    browseCardHeight: browseHeight,
    libraryCardHeight: libraryHeight,
    bandHeight: bandH,
  };
}

export function useMainLayout() {
  const [layout, setLayout] = useState<MainLayout | null>(null);

  useLayoutEffect(() => {
    const sync = () => {
      const next = computeLayout();
      if (next) document.documentElement.style.setProperty("--band-h", `${next.bandHeight}px`);
      setLayout(next);
    };

    // Recompute only on real layout changes (orientation / window size), not on
    // keyboard toggles — the visual viewport resize would shift the whole stack.
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);

    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  return layout;
}
