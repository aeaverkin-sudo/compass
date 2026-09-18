"use client";

import { useLayoutEffect, useState } from "react";
import {
  CARD_TOP_BROWSE_OFFSET_PX,
  CARD_TOP_LIBRARY_OFFSET_PX,
  SHEET_INSET,
  SHEET_PEEK_LVH,
} from "../layout";

export type MainLayout = {
  qrTop: number;
  cardTopBrowse: number;
  cardTopLibrary: number;
  sheetTopBrowse: number;
  sheetTopLibrary: number;
  edgeInsetBrowse: number;
  edgeInsetLibrary: number;
};

function readSafeAreaBottom() {
  if (typeof document === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.paddingBottom = "env(safe-area-inset-bottom)";
  probe.style.position = "fixed";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  document.documentElement.appendChild(probe);
  const bottom = probe.getBoundingClientRect().height;
  document.documentElement.removeChild(probe);
  return bottom;
}

function computeLayout(cardHeight: number, compactCardHeight: number): MainLayout | null {
  if (typeof window === "undefined" || cardHeight <= 0 || compactCardHeight <= 0) return null;

  const viewportH = window.innerHeight;
  const safeBottom = readSafeAreaBottom();
  const cardTopBrowse = CARD_TOP_BROWSE_OFFSET_PX;
  const cardBottomBrowse = cardTopBrowse + cardHeight;

  const sheetTopFromCard = cardBottomBrowse - SHEET_INSET.browse.overlap;
  const minSheetHeight = (viewportH * SHEET_PEEK_LVH) / 100 + safeBottom;
  const sheetTopBrowse = Math.min(sheetTopFromCard, viewportH - minSheetHeight);

  const cardTopLibrary = CARD_TOP_LIBRARY_OFFSET_PX;
  const sheetTopLibrary = cardTopLibrary + compactCardHeight + SHEET_INSET.library.gap;

  return {
    qrTop: 0,
    cardTopBrowse,
    cardTopLibrary,
    sheetTopBrowse,
    sheetTopLibrary,
    edgeInsetBrowse: SHEET_INSET.browse.horizontal,
    edgeInsetLibrary: SHEET_INSET.library.horizontal,
  };
}

export function useMainLayout(cardHeight: number, compactCardHeight: number) {
  const [layout, setLayout] = useState<MainLayout | null>(null);

  useLayoutEffect(() => {
    const sync = () => {
      setLayout(computeLayout(cardHeight, compactCardHeight));
    };

    sync();
    window.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("resize", sync);

    return () => {
      window.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("resize", sync);
    };
  }, [cardHeight, compactCardHeight]);

  return layout;
}
