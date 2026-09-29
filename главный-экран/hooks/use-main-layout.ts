"use client";

import { useLayoutEffect, useState } from "react";
import {
  browseCardHeightPx,
  libraryCardHeightPx,
  librarySheetTopPx,
  libraryStackTopPx,
  BOTTOM_PLATE_DROP_PX,
  BOTTOM_PLATE_LOWER_PX,
  BROWSER_COMMAND_BAND_PX,
  BROWSE_QR_SIZE,
  HEADER_RHYTHM_PX,
  RULE_GAP_PX,
  SHEET_INSET,
} from "../layout";

/** A keyboard is taller than this. Smaller gaps are the browser address bar. */
const KEYBOARD_MIN_PX = 120;

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

function isHomeScreen() {
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    nav.standalone === true
  );
}

/** Phone browser, not the home-screen icon. Desktop and the icon keep the designed plate. */
function isPhoneBrowser() {
  return (
    !isHomeScreen() &&
    window.matchMedia("(pointer: coarse)").matches &&
    window.matchMedia("(hover: none)").matches
  );
}

/**
 * Bottom of the area above the address bar, in layout pixels.
 * A keyboard gap is ignored so the plate does not jump while typing.
 */
function visibleBottomPx(viewportH: number, remembered: { value: number }) {
  const viewport = window.visualViewport;
  const bottom = viewport ? Math.round(viewport.offsetTop + viewport.height) : viewportH;
  const hidden = viewportH - bottom;
  if (hidden >= KEYBOARD_MIN_PX) return remembered.value || viewportH;
  remembered.value = bottom;
  return bottom;
}

function computeLayout(rememberedBottom: { value: number }): MainLayout | null {
  if (typeof window === "undefined") return null;

  // `html` is position:fixed inset:0, so its clientHeight is the full layout
  // viewport and stays stable when the iOS keyboard shrinks the visual viewport.
  const viewportH = document.documentElement.clientHeight || window.innerHeight;
  const safeTop = readSafeAreaInset("top");
  const qrTop = safeTop + HEADER_RHYTHM_PX;
  const cardTopBrowse = safeTop + HEADER_RHYTHM_PX + BROWSE_QR_SIZE + RULE_GAP_PX;
  let browseHeight = browseCardHeightPx(viewportH, safeTop);
  let cardBottomBrowse = cardTopBrowse + browseHeight;
  let browseMenuCenterY = (cardBottomBrowse + viewportH) / 2 + BOTTOM_PLATE_DROP_PX;
  const phoneBrowser = isPhoneBrowser();
  if (phoneBrowser) {
    const visibleBottom = Math.min(viewportH, visibleBottomPx(viewportH, rememberedBottom));
    const plateTop = visibleBottom - BROWSER_COMMAND_BAND_PX + Math.round(viewportH * 0.1);
    cardBottomBrowse = Math.round(Math.max(cardTopBrowse + 160, plateTop - BOTTOM_PLATE_LOWER_PX));
    browseHeight = cardBottomBrowse - cardTopBrowse;
    browseMenuCenterY = Math.round(plateTop + BROWSER_COMMAND_BAND_PX / 2);
    document.documentElement.style.setProperty("--browse-card-h", `${Math.round(browseHeight)}px`);
  } else {
    document.documentElement.style.removeProperty("--browse-card-h");
  }
  const libraryHeight = libraryCardHeightPx(viewportH, safeTop);
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

function sameLayout(a: MainLayout | null, b: MainLayout | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (Object.keys(a) as (keyof MainLayout)[]).every((key) => a[key] === b[key]);
}

export function useMainLayout() {
  const [layout, setLayout] = useState<MainLayout | null>(null);

  useLayoutEffect(() => {
    const rememberedBottom = { value: 0 };
    const sync = () => {
      setLayout((current) => {
        const next = computeLayout(rememberedBottom);
        return sameLayout(current, next) ? current : next;
      });
    };

    // Resize and the address bar. A keyboard gap does not change the remembered bottom,
    // and an unchanged layout does not render again.
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", sync);
    viewport?.addEventListener("scroll", sync);

    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      viewport?.removeEventListener("resize", sync);
      viewport?.removeEventListener("scroll", sync);
      document.documentElement.style.removeProperty("--browse-card-h");
    };
  }, []);

  return layout;
}
