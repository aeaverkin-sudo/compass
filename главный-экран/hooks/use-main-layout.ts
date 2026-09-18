"use client";

import { useLayoutEffect, useState } from "react";
import {
  browseCardHeightPx,
  CARD_TOP_BROWSE_OFFSET_PX,
  CARD_TOP_LIBRARY_OFFSET_PX,
  SHEET_INSET,
} from "../layout";

export type MainLayout = {
  qrTop: number;
  cardTopBrowse: number;
  cardTopLibrary: number;
  sheetTopBrowse: number;
  sheetTopLibrary: number;
  edgeInsetBrowse: number;
  edgeInsetLibrary: number;
  browseCardHeight: number;
};

function computeLayout(compactCardHeight: number): MainLayout | null {
  if (typeof window === "undefined") return null;

  const viewportH = window.innerHeight;
  const browseHeight = browseCardHeightPx(viewportH);
  const cardTopBrowse = CARD_TOP_BROWSE_OFFSET_PX;
  const cardBottomBrowse = cardTopBrowse + browseHeight;
  const sheetTopBrowse = cardBottomBrowse - SHEET_INSET.browse.overlap;

  const compactHeight = compactCardHeight > 0 ? compactCardHeight : 72;
  const cardTopLibrary = CARD_TOP_LIBRARY_OFFSET_PX;
  const sheetTopLibrary = cardTopLibrary + compactHeight + SHEET_INSET.library.gap;

  return {
    qrTop: 0,
    cardTopBrowse,
    cardTopLibrary,
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
