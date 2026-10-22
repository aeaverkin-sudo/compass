"use client";

import { useLayoutEffect, useState } from "react";
import {
  libraryCardHeightPx,
  librarySheetTopPx,
  libraryStackTopPx,
  writeScreenVars,
  rememberScreen,
  resetScreen,
  shouldRemeasure,
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

function computeLayout(): MainLayout | null {
  if (typeof window === "undefined") return null;

  const { visible: visibleH, band: bandH, scale } = writeScreenVars();
  const safeTop = readSafeAreaInset("top");
  const qrTop = safeTop + SCREEN_TOP_AXIS_PX * scale;
  const cardTopBrowse = safeTop + (HEADER_RHYTHM_PX + BROWSE_QR_SIZE + RULE_GAP_PX) * scale;
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
    headerScale: scale,
  };
}

type HeadMeasure = { appH: string; bandH: string; vvBottom: string; hd: string };

function readScreenSnapshot(): HeadMeasure {
  const root = document.documentElement;
  const read = (name: string) => root.style.getPropertyValue(name).trim();
  return {
    appH: read("--app-h"),
    bandH: read("--band-h"),
    vvBottom: read("--vv-bottom"),
    hd: read("--hd"),
  };
}

function headMeasure(): HeadMeasure | null {
  const stored = (window as Window & { __compassHeadMeasure?: HeadMeasure }).__compassHeadMeasure;
  return stored ?? null;
}

let startupLogged = false;

/**
 * How long the installed app may still be opening to the full screen.
 * 400ms cut the measure off while `svh` was still the short value.
 */
const STARTUP_CAP_MS = 1200;

export function useMainLayout() {
  const [layout, setLayout] = useState<MainLayout | null>(null);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const cold = !root.classList.contains("compass-settled");

    const sync = () => {
      const head = cold ? headMeasure() : null;
      const next = computeLayout();
      if (head && !startupLogged && process.env.NODE_ENV !== "production") {
        startupLogged = true;
        const after = readScreenSnapshot();
        console.info("[layout] head vs mount", {
          appH: head.appH,
          after: after.appH,
          bandH: { head: head.bandH, after: after.bandH },
          vvBottom: { head: head.vvBottom, after: after.vvBottom },
          hd: { head: head.hd, after: after.hd },
        });
      }
      setLayout(next);
    };

    // Follow the screen while the installed app is still opening. After that,
    // a taller screen is the full-screen expansion and a shorter one is the keyboard.
    sync();
    rememberScreen();

    let timer = 0;
    let watch = 0;
    let outer = 0;
    let inner = 0;
    const follow = () => {
      if (!shouldRemeasure(root.classList.contains("compass-settled"))) return;
      sync();
      rememberScreen();
    };
    let arm = () => {};
    if (cold) {
      const started = performance.now();
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
      const clearArm = () => {
        if (timer) window.clearTimeout(timer);
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
        timer = 0;
      };
      const finish = () => {
        clearArm();
        sync();
        rememberScreen();
        root.classList.add("compass-settled");
      };
      const finishSoon = () => {
        clearArm();
        outer = requestAnimationFrame(() => {
          inner = requestAnimationFrame(finish);
        });
      };
      // A browser viewport is already stable: two frames is enough.
      // The installed app can take longer than 400ms to open to the full screen.
      arm = () => {
        clearArm();
        const remain = STARTUP_CAP_MS - (performance.now() - started);
        if (standalone && remain > 0) {
          timer = window.setTimeout(finishSoon, remain);
          return;
        }
        finishSoon();
      };
      arm();
      // The expansion often fires no resize. Keep reading the height for the first three seconds.
      if (standalone) {
        const sample = () => {
          follow();
          if (performance.now() - started < 3000) watch = window.setTimeout(sample, 200);
        };
        watch = window.setTimeout(sample, 200);
      }
    }

    const onViewport = () => {
      const settled = root.classList.contains("compass-settled");
      follow();
      if (!settled) arm();
    };
    const onTurn = () => {
      resetScreen();
      sync();
      rememberScreen();
    };
    window.visualViewport?.addEventListener("resize", onViewport);
    window.addEventListener("resize", onViewport);
    window.addEventListener("orientationchange", onTurn);

    return () => {
      if (timer) window.clearTimeout(timer);
      if (watch) window.clearTimeout(watch);
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
      window.visualViewport?.removeEventListener("resize", onViewport);
      window.removeEventListener("resize", onViewport);
      window.removeEventListener("orientationchange", onTurn);
    };
  }, []);

  return layout;
}
