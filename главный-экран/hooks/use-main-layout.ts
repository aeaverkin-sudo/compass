"use client";

import { useLayoutEffect, useState } from "react";
import {
  EDGE_INSET_CM,
  GAP_CM,
  LIBRARY_SHEET_GAP_PX,
  QR_OVERLAP_LIBRARY_PX,
  QR_SIZE,
  SHEET_OVERLAP_PX,
  SHEET_PEEK_MIN_LVH,
} from "../layout";

export type MainLayout = {
  qrTop: number;
  cardTopBrowse: number;
  cardTopLibrary: number;
  sheetTopBrowse: number;
  sheetTopLibrary: number;
  edgeInsetPx: number;
};

let cachedCmPx: number | null = null;

function cmToPx(cm: number) {
  if (cachedCmPx !== null) return cachedCmPx * cm;
  if (typeof document === "undefined") return cm * 37.795;

  const probe = document.createElement("div");
  probe.style.width = "1cm";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  cachedCmPx = probe.getBoundingClientRect().width || 37.795;
  document.body.removeChild(probe);
  return cachedCmPx * cm;
}

function readSafeAreaTop() {
  if (typeof document === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.paddingTop = "env(safe-area-inset-top)";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  const top = probe.getBoundingClientRect().height;
  document.body.removeChild(probe);
  return top;
}

function readSafeAreaBottom() {
  if (typeof document === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.paddingBottom = "env(safe-area-inset-bottom)";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  const bottom = probe.getBoundingClientRect().height;
  document.body.removeChild(probe);
  return bottom;
}

function computeLayout(cardHeight: number, compactCardHeight: number): MainLayout | null {
  if (typeof window === "undefined" || cardHeight <= 0 || compactCardHeight <= 0) return null;

  const viewportH = window.innerHeight;
  const safeTop = readSafeAreaTop();
  const safeBottom = readSafeAreaBottom();
  const edgeInsetPx = cmToPx(EDGE_INSET_CM);
  const gapPx = cmToPx(GAP_CM);

  const freeFieldTop = safeTop + gapPx;
  const qrTop = freeFieldTop;
  const cardTopBrowse = freeFieldTop + QR_SIZE + gapPx;
  const cardBottomBrowse = cardTopBrowse + cardHeight;

  const minSheetHeight = (viewportH * SHEET_PEEK_MIN_LVH) / 100 + safeBottom;
  const maxSheetTop = viewportH - minSheetHeight;
  const sheetTopBrowse = Math.min(cardBottomBrowse - SHEET_OVERLAP_PX, maxSheetTop);

  const cardTopLibrary = qrTop + QR_SIZE - QR_OVERLAP_LIBRARY_PX;
  const sheetTopLibrary = cardTopLibrary + compactCardHeight + LIBRARY_SHEET_GAP_PX;

  return {
    qrTop,
    cardTopBrowse,
    cardTopLibrary,
    sheetTopBrowse,
    sheetTopLibrary,
    edgeInsetPx,
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
