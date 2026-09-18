"use client";

import { useLayoutEffect, useState } from "react";
import {
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
};

function computeLayout(cardHeight: number, compactCardHeight: number): MainLayout | null {
  if (typeof window === "undefined" || cardHeight <= 0 || compactCardHeight <= 0) return null;

  const cardTopBrowse = CARD_TOP_BROWSE_OFFSET_PX;
  const cardBottomBrowse = cardTopBrowse + cardHeight;
  const sheetTopBrowse = cardBottomBrowse - SHEET_INSET.browse.overlap;

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
