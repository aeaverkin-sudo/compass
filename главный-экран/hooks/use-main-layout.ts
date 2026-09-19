"use client";

import { useLayoutEffect, useState } from "react";
import {
  browseCardHeightPx,
  QR_GAP_SYMMETRIC_PX,
  QR_OVERLAP_LIBRARY_PX,
  QR_SIZE,
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

function computeLayout(compactCardHeight: number): MainLayout | null {
  if (typeof window === "undefined") return null;

  const viewportH = window.innerHeight;
  const safeTop = readSafeAreaInset("top");
  const qrTop = safeTop + QR_GAP_SYMMETRIC_PX;
  const cardTopBrowse = qrTop + QR_SIZE + QR_GAP_SYMMETRIC_PX;
  const browseHeight = browseCardHeightPx(viewportH, safeTop);
  const cardBottomBrowse = cardTopBrowse + browseHeight;
  const browseMenuCenterY = (cardBottomBrowse + viewportH) / 2;
  const sheetTopBrowse = cardBottomBrowse - SHEET_INSET.browse.overlap;

  const compactHeight = compactCardHeight > 0 ? compactCardHeight : 72;
  const cardTopLibrary = qrTop + QR_SIZE - QR_OVERLAP_LIBRARY_PX;
  const sheetTopLibrary = cardTopLibrary + compactHeight + SHEET_INSET.library.gap;

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
  };
}

export function useMainLayout(compactCardHeight: number) {
  const [layout, setLayout] = useState<MainLayout | null>(null);

  useLayoutEffect(() => {
    const sync = () => {
      setLayout(computeLayout(compactCardHeight));
    };

    sync();
    window.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("resize", sync);

    return () => {
      window.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("resize", sync);
    };
  }, [compactCardHeight]);

  return layout;
}
