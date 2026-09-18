"use client";

import { useLayoutEffect, useState } from "react";
import {
  EDGE_INSET,
  LIBRARY_SHEET_GAP_PX,
  QR_SIZE,
  QR_TO_CARD_GAP,
  SHEET_OVERLAP_PX,
  SHEET_PEEK_LVH,
} from "../layout";

export type MainLayout = {
  qrTop: number;
  cardTopBrowse: number;
  cardTopLibrary: number;
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
  const edgeInsetPx = cmToPx(parseFloat(EDGE_INSET));
  const gapCm = cmToPx(parseFloat(QR_TO_CARD_GAP));
  const libraryTopCm = cmToPx(4);

  const sheetHeight = (viewportH * SHEET_PEEK_LVH) / 100 + safeBottom;
  const sheetTop = viewportH - sheetHeight;
  const cardBottomBrowse = sheetTop + SHEET_OVERLAP_PX;
  const cardTopBrowse = cardBottomBrowse - cardHeight;

  const freeFieldTop = safeTop + gapCm;
  const qrFieldBottom = cardTopBrowse - gapCm;
  const qrCenter = (freeFieldTop + qrFieldBottom) / 2;
  const qrTop = qrCenter - QR_SIZE / 2;

  const cardTopLibrary = safeTop + libraryTopCm;
  const sheetTopLibrary = cardTopLibrary + compactCardHeight + LIBRARY_SHEET_GAP_PX;

  return {
    qrTop,
    cardTopBrowse,
    cardTopLibrary,
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
