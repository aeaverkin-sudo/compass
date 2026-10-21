"use client";

import { useLayoutEffect, useState } from "react";
import { flushSync } from "react-dom";
import {
  libraryCardHeightPx,
  librarySheetTopPx,
  libraryStackTopPx,
  writeScreenVars,
  standaloneApp,
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

/** Quiet time with no viewport event before the installed app is shown. */
const STARTUP_QUIET_MS = 180;
/** The card is shown by this point even if the viewport is still reporting events. */
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

    // Recompute only on real layout changes (orientation / window size), not on
    // keyboard toggles — the visual viewport resize would shift the whole stack.
    sync();

    let timer = 0;
    let outer = 0;
    let inner = 0;
    let widthAtShow = window.innerWidth;
    let onViewport: (() => void) | null = null;
    let arm = () => {};
    const standalone = standaloneApp();
    const dropViewport = () => {
      if (!onViewport) return;
      window.visualViewport?.removeEventListener("resize", onViewport);
      window.visualViewport?.removeEventListener("scroll", onViewport);
      onViewport = null;
    };
    if (cold) {
      const started = performance.now();
      const clearArm = () => {
        if (timer) window.clearTimeout(timer);
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
        timer = 0;
      };
      const finish = () => {
        clearArm();
        flushSync(() => {
          sync();
        });
        if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
        widthAtShow = window.innerWidth;
        root.classList.add("compass-settled");
        dropViewport();
      };
      const finishSoon = () => {
        clearArm();
        outer = requestAnimationFrame(() => {
          inner = requestAnimationFrame(finish);
        });
      };
      // A browser viewport is already stable: two frames is enough.
      // The installed app keeps reporting a moving viewport, so wait until it is quiet.
      arm = () => {
        clearArm();
        const remain = STARTUP_CAP_MS - (performance.now() - started);
        if (standalone && remain > 0) {
          timer = window.setTimeout(finishSoon, Math.min(STARTUP_QUIET_MS, remain));
          return;
        }
        finishSoon();
      };
      onViewport = () => {
        if (root.classList.contains("compass-settled")) return;
        if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
        sync();
        arm();
      };
      window.visualViewport?.addEventListener("resize", onViewport);
      window.visualViewport?.addEventListener("scroll", onViewport);
      arm();
    }

    const onResize = () => {
      if (standalone && root.classList.contains("compass-settled") && window.innerWidth === widthAtShow) return;
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
      sync();
      if (standalone && !root.classList.contains("compass-settled")) arm();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", sync);

    return () => {
      if (timer) window.clearTimeout(timer);
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
      dropViewport();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  return layout;
}
