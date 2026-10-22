"use client";

import { useLayoutEffect, useState } from "react";
import {
  libraryCardHeightPx,
  librarySheetTopPx,
  libraryStackTopPx,
  writeScreenVars,
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

/** A late viewport correction on launch must land before motion starts. Past this, motion is allowed anyway. */
const STARTUP_CAP_MS = 400;

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
    let width = window.innerWidth;
    let onViewport: (() => void) | null = null;
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
        // The installed app has finished opening to the full screen. Freeze that height.
        sync();
        width = window.innerWidth;
        root.classList.add("compass-settled");
        if (onViewport) window.visualViewport?.removeEventListener("resize", onViewport);
      };
      const finishSoon = () => {
        clearArm();
        outer = requestAnimationFrame(() => {
          inner = requestAnimationFrame(finish);
        });
      };
      // A browser viewport is already stable: two frames is enough.
      // The installed app reports a viewport that moves for a few hundred milliseconds.
      const arm = () => {
        clearArm();
        const remain = STARTUP_CAP_MS - (performance.now() - started);
        if (standalone && remain > 0) {
          timer = window.setTimeout(finishSoon, remain);
          return;
        }
        finishSoon();
      };
      onViewport = () => {
        if (root.classList.contains("compass-settled")) return;
        sync();
        arm();
      };
      window.visualViewport?.addEventListener("resize", onViewport);
      arm();
    }

    // Until the screen has settled, a height-only resize is the standalone app
    // opening to full screen, so it still measures. After that, the keyboard
    // changes height without changing width and must not move the plaque.
    const onResize = () => {
      if (root.classList.contains("compass-settled") && window.innerWidth === width) return;
      width = window.innerWidth;
      sync();
    };
    const onTurn = () => {
      width = window.innerWidth;
      sync();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onTurn);

    return () => {
      if (timer) window.clearTimeout(timer);
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
      if (onViewport) window.visualViewport?.removeEventListener("resize", onViewport);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onTurn);
    };
  }, []);

  return layout;
}
