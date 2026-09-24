"use client";

import { useLayoutEffect, useState } from "react";
import {
  browseCardHeightPx,
  browseStackTopPx,
  libraryCardHeightPx,
  librarySheetTopPx,
  libraryStackTopPx,
  QR_GAP_SYMMETRIC_PX,
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

function computeLayout(): MainLayout | null {
  if (typeof window === "undefined") return null;

  // `html` is position:fixed inset:0, so its clientHeight is the full layout
  // viewport and stays stable when the iOS keyboard shrinks the visual viewport.
  const viewportH = document.documentElement.clientHeight || window.innerHeight;
  const safeTop = readSafeAreaInset("top");
  const qrTop = safeTop + QR_GAP_SYMMETRIC_PX;
  const cardTopBrowse = browseStackTopPx(safeTop);
  const browseHeight = browseCardHeightPx(viewportH, safeTop);
  const libraryHeight = libraryCardHeightPx(viewportH, safeTop);
  const cardBottomBrowse = cardTopBrowse + browseHeight;
  const browseMenuCenterY = (cardBottomBrowse + viewportH) / 2;
  const sheetTopBrowse = cardBottomBrowse - SHEET_INSET.browse.overlap;
  const cardTopLibrary = libraryStackTopPx(safeTop);
  const sheetTopLibrary = librarySheetTopPx(viewportH, safeTop);

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
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);

    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  return layout;
}
