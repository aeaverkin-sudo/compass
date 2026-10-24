"use client";

import { useLayoutEffect, useState } from "react";
import {
  libraryCardHeightPx,
  librarySheetTopPx,
  libraryStackTopPx,
  BAND_DROP_PX,
  BAND_ROW_PX,
  writeHeaderScale,
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
  /** 1 comfortable, below 1 compact: the QR, photo, name and their gaps. */
  headerScale: number;
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

function computeLayout(columnH: number): MainLayout | null {
  if (typeof window === "undefined") return null;

  const { scale } = writeHeaderScale();
  const safeTop = readSafeAreaInset("top");
  const bandH = BAND_ROW_PX + Math.max(0, readSafeAreaInset("bottom") - BAND_DROP_PX);
  const qrTop = safeTop + SCREEN_TOP_AXIS_PX * scale;
  const cardTopBrowse = safeTop + (HEADER_RHYTHM_PX + BROWSE_QR_SIZE + RULE_GAP_PX) * scale;
  const cardBottomBrowse = columnH;
  const browseHeight = cardBottomBrowse - cardTopBrowse;
  const libraryHeight = libraryCardHeightPx(columnH, safeTop);
  const browseMenuCenterY = cardBottomBrowse + bandH / 2;
  const sheetTopBrowse = cardBottomBrowse - SHEET_INSET.browse.overlap;
  const cardTopLibrary = libraryStackTopPx(safeTop);
  const sheetTopLibrary = librarySheetTopPx(columnH, safeTop);

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
    headerScale: scale,
  };
}

/**
 * Card geometry.
 * A positive column height is the content column above the bar (the shell
 * already sized it). Null means that column is not measured yet.
 * Omitted: screens without that column keep the header scale from the root.
 * The keyboard is not a source — visual viewport stays out of this hook.
 */
export function useMainLayout(columnHeight?: number | null) {
  const [layout, setLayout] = useState<MainLayout | null>(null);

  useLayoutEffect(() => {
    if (columnHeight === null) return;
    const root = document.documentElement;
    let stamp = "";

    const apply = (height: number) => {
      const next = computeLayout(height);
      if (!next) return;
      const nextStamp = `${height}:${next.headerScale}:${next.cardTopBrowse}:${next.cardBottomBrowse}`;
      if (nextStamp !== stamp) {
        stamp = nextStamp;
        setLayout(next);
      }
      root.classList.add("compass-settled");
    };

    if (typeof columnHeight === "number") {
      if (columnHeight > 0) apply(columnHeight);
      return;
    }

    const sync = () => apply(writeHeaderScale().visible);
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, [columnHeight]);

  return layout;
}
