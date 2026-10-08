"use client";

import { useLayoutEffect, useState } from "react";
import {
  browseBandHeightPx,
  libraryCardHeightPx,
  librarySheetTopPx,
  libraryStackTopPx,
  BROWSE_QR_SIZE,
  HEADER_RHYTHM_PX,
  SCREEN_TOP_AXIS_PX,
  RULE_GAP_PX,
  SHEET_INSET,
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

/** `svh` is the visible height. `lvh` is the stable full screen, the same in every browser on this phone. */
function readViewport(unit: "svh" | "lvh") {
  const probe = document.createElement("div");
  probe.style.cssText = `position:fixed;top:0;height:100${unit};visibility:hidden;pointer-events:none`;
  document.documentElement.appendChild(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return height || window.innerHeight;
}

function computeLayout(): MainLayout | null {
  if (typeof window === "undefined") return null;

  const visibleH = readViewport("svh");
  const fullH = readViewport("lvh");
  const safeTop = readSafeAreaInset("top");
  const qrTop = safeTop + SCREEN_TOP_AXIS_PX;
  const cardTopBrowse = safeTop + HEADER_RHYTHM_PX + BROWSE_QR_SIZE + RULE_GAP_PX;
  const bandH = Math.max(0, Math.round(browseBandHeightPx(fullH)));
  const root = document.documentElement;
  root.style.setProperty("--app-h", `${Math.round(visibleH)}px`);
  root.style.setProperty("--band-h", `${bandH}px`);
  root.classList.add("compass-sized");
  const shell = document.querySelector("main.compass-main");
  const vv = window.visualViewport;
  if (vv && shell) {
    const gap = shell.getBoundingClientRect().bottom - vv.height;
    const lift = gap > 0 && gap < 120 ? Math.round(gap) : 0;
    root.style.setProperty("--vv-bottom", `${lift}px`);
  }
  const cardBottomBrowse = visibleH - bandH;
  const browseHeight = cardBottomBrowse - cardTopBrowse;
  const libraryHeight = libraryCardHeightPx(visibleH, safeTop);
  const browseMenuCenterY = cardBottomBrowse + bandH / 2;
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
      setLayout(computeLayout());
    };

    // Recompute only on real layout changes (orientation / window size), not on
    // keyboard toggles — the visual viewport resize would shift the whole stack.
    sync();
    // The first numbers are already on :root. Height transitions start after that paint.
    const frame = requestAnimationFrame(() => {
      document.documentElement.classList.add("compass-settled");
    });
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  return layout;
}
