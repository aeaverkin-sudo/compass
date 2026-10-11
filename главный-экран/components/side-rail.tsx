"use client";

import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type TransitionEvent,
} from "react";
import { ScanButton } from "@/shared/components/scan-icon";
import { CardShareControl, useCardShare } from "@/shared/components/card-share-control";
import { getNextScanAddons } from "@/shared/services/card-snapshot";
import { RAIL_HOLD_MS, REORDER_SLOP_PX } from "@/shared/lib/reorder-hold";
import { useAppStore } from "@/shared/store/app-store";
import type { Card } from "@/shared/types";
import { BROWSE_QR_SIZE, HERO_PHOTO_PX, layoutTop, railPhotoTopFromQrTop } from "../layout";
import { NextScanMenu } from "./next-scan-menu";

/** Visible mark heights. The size-11 tap sits on each mark and does not enter the column. */
const SHARE_PX = 16.1;
const SCAN_PX = 16.1;
const PLUS_PX = 18;
const COUNT_PX = 11;

type RailDock = "qr" | "photo";
type Anchor = { top: number; height: number };

function RailMark({ height, children }: { height: number; children?: ReactNode }) {
  return (
    <div className="relative w-full shrink-0" style={{ height }}>
      {children != null ? (
        <div className="pointer-events-auto absolute top-1/2 left-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function measureAnchors(rail: HTMLElement, fallbackQrTop: number): { qr: Anchor; photo: Anchor } {
  const shell = rail.closest(".compass-main");
  const fallback = {
    qr: { top: fallbackQrTop, height: BROWSE_QR_SIZE },
    photo: { top: railPhotoTopFromQrTop(fallbackQrTop), height: HERO_PHOTO_PX },
  };
  if (!shell) return fallback;
  const shellRect = shell.getBoundingClientRect();

  let qrEl: Element | null = null;
  for (const svg of shell.querySelectorAll("svg")) {
    if (rail.contains(svg)) continue;
    const rect = svg.getBoundingClientRect();
    if (rect.width >= 120 && Math.abs(rect.width - rect.height) < 3) {
      qrEl = svg;
      break;
    }
  }

  let photoEl: Element | null = null;
  for (const img of shell.querySelectorAll("img")) {
    if (rail.contains(img)) continue;
    const rect = img.getBoundingClientRect();
    if (rect.width >= 110 && rect.width <= 140 && Math.abs(rect.width - rect.height) < 4) {
      photoEl = img;
      break;
    }
  }
  if (!photoEl) {
    for (const node of shell.querySelectorAll("div")) {
      if (rail.contains(node)) continue;
      const rect = node.getBoundingClientRect();
      if (Math.abs(rect.width - HERO_PHOTO_PX) < 1.5 && Math.abs(rect.height - HERO_PHOTO_PX) < 1.5) {
        photoEl = node;
        break;
      }
    }
  }

  const qrRect = qrEl?.getBoundingClientRect();
  const photoRect = photoEl?.getBoundingClientRect();
  return {
    qr: qrRect
      ? { top: qrRect.top - shellRect.top, height: qrRect.height }
      : fallback.qr,
    photo: photoRect
      ? { top: photoRect.top - shellRect.top, height: photoRect.height }
      : fallback.photo,
  };
}

export function SideRail({
  qrTop,
  counterRightCss,
  card,
  index,
  total,
  showPlus,
  frozen,
}: {
  qrTop: number;
  counterRightCss: string;
  card: Card;
  index: number;
  total: number;
  showPlus: boolean;
  frozen: boolean;
}) {
  const updateCard = useAppStore((state) => state.updateCard);
  const setRailDock = useAppStore((state) => state.setRailDock);
  const railDock = useAppStore((state) => (state.user.railDock === "photo" ? "photo" : "qr"));
  const share = useCardShare(card);
  const canShare = Boolean(card.publicToken) && !frozen;

  const rootRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<RailDock>(railDock);
  const anchorsRef = useRef({
    qr: { top: qrTop, height: BROWSE_QR_SIZE },
    photo: { top: railPhotoTopFromQrTop(qrTop), height: HERO_PHOTO_PX },
  });
  const pointerDownRef = useRef(false);
  const holdTimerRef = useRef<number | null>(null);
  const startRef = useRef({ x: 0, y: 0, pointerId: -1 });
  const liftedRef = useRef(false);
  const settlingRef = useRef(false);
  const dragYRef = useRef(0);
  const moveFrameRef = useRef(0);
  const suppressClickRef = useRef(false);
  const detachRef = useRef<(() => void) | null>(null);

  const clearHoldTimer = () => {
    if (holdTimerRef.current == null) return;
    window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  };

  const paintTransform = (dy: number, scale: boolean) => {
    const node = rootRef.current;
    if (!node) return;
    node.style.transform = scale ? `translateY(${dy}px) scale(1.04)` : `translateY(${dy}px)`;
  };

  const paintDock = (dock: RailDock, opts?: { transition?: string; clearTransform?: boolean }) => {
    const node = rootRef.current;
    if (!node) return;
    const anchor = anchorsRef.current[dock];
    node.style.top = layoutTop(anchor.top);
    node.style.height = `${anchor.height}px`;
    if (opts?.transition != null) node.style.transition = opts.transition;
    if (opts?.clearTransform) {
      node.style.transform = "";
      dragYRef.current = 0;
    }
  };

  const syncAnchors = () => {
    const node = rootRef.current;
    if (!node || liftedRef.current || settlingRef.current) return;
    anchorsRef.current = measureAnchors(node, qrTop);
    paintDock(dockRef.current, { transition: "none", clearTransform: true });
  };

  const endLiftVisual = () => {
    const node = rootRef.current;
    if (!node) return;
    node.style.boxShadow = "none";
    node.style.willChange = "";
  };

  const resetLift = () => {
    liftedRef.current = false;
    settlingRef.current = false;
    dragYRef.current = 0;
    if (moveFrameRef.current) {
      cancelAnimationFrame(moveFrameRef.current);
      moveFrameRef.current = 0;
    }
    const node = rootRef.current;
    if (node) {
      node.style.transition = "none";
      node.style.transform = "";
      node.style.boxShadow = "none";
      node.style.willChange = "";
    }
    paintDock(dockRef.current, { transition: "none" });
  };

  const cancelGesture = () => {
    clearHoldTimer();
    pointerDownRef.current = false;
    detachRef.current?.();
    detachRef.current = null;
    const node = rootRef.current;
    const pointerId = startRef.current.pointerId;
    if (node && pointerId >= 0) {
      try {
        if (node.hasPointerCapture(pointerId)) node.releasePointerCapture(pointerId);
      } catch {
        // Already released.
      }
    }
    resetLift();
  };

  useEffect(() => {
    dockRef.current = railDock;
    syncAnchors();
  }, [railDock, qrTop, card.id]);

  useEffect(() => {
    const onResize = () => syncAnchors();
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    const frame = requestAnimationFrame(syncAnchors);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, [qrTop, card.id]);

  useEffect(() => {
    const onScroll = () => {
      if (pointerDownRef.current || liftedRef.current) cancelGesture();
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") cancelGesture();
    };
    const onBlur = () => cancelGesture();
    const scroller = document.querySelector(".compass-card-scroll");
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("blur", onBlur);
    return () => {
      scroller?.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("blur", onBlur);
      cancelGesture();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/unmount only
  }, []);

  const finishDock = (next: RailDock, fromTop: number, fromHeight: number) => {
    const node = rootRef.current;
    if (!node) return;
    const to = anchorsRef.current[next];
    const offset = fromTop - to.top;
    dockRef.current = next;
    liftedRef.current = false;
    settlingRef.current = true;
    endLiftVisual();
    node.style.willChange = "transform";
    node.style.transition = "none";
    node.style.top = layoutTop(to.top);
    node.style.height = `${fromHeight}px`;
    dragYRef.current = offset;
    paintTransform(offset, false);
    requestAnimationFrame(() => {
      if (!rootRef.current) return;
      rootRef.current.style.transition = "transform 250ms ease-out, height 250ms ease-out";
      rootRef.current.style.height = `${to.height}px`;
      dragYRef.current = 0;
      paintTransform(0, false);
    });
  };

  const onTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.propertyName !== "transform") return;
    if (!settlingRef.current) return;
    settlingRef.current = false;
    const node = rootRef.current;
    if (!node) return;
    node.style.transition = "none";
    node.style.transform = "";
    node.style.willChange = "";
    paintDock(dockRef.current, { transition: "none" });
    setRailDock(dockRef.current);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (settlingRef.current || liftedRef.current) return;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const host = event.currentTarget;
    pointerDownRef.current = true;
    startRef.current = { x: startX, y: startY, pointerId };
    clearHoldTimer();
    syncAnchors();

    try {
      host.setPointerCapture(pointerId);
    } catch {
      // Capture fails if the pointer is already up.
    }

    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      if (!pointerDownRef.current) return;
      suppressClickRef.current = true;
      liftedRef.current = true;
      dragYRef.current = 0;
      host.style.transition = "transform 120ms ease-out, box-shadow 120ms ease-out";
      host.style.willChange = "transform";
      host.style.boxShadow = "0 6px 18px rgba(0,0,0,.14)";
      paintTransform(0, true);
      requestAnimationFrame(() => {
        if (!rootRef.current || !liftedRef.current) return;
        rootRef.current.style.transition = "none";
      });
    }, RAIL_HOLD_MS);

    let ended = false;

    const move = (native: PointerEvent) => {
      if (native.pointerId !== pointerId) return;
      const dx = native.clientX - startX;
      const dy = native.clientY - startY;
      if (!liftedRef.current) {
        if (Math.hypot(dx, dy) > REORDER_SLOP_PX) clearHoldTimer();
        return;
      }
      if (native.cancelable) native.preventDefault();
      dragYRef.current = dy;
      if (moveFrameRef.current) return;
      moveFrameRef.current = requestAnimationFrame(() => {
        moveFrameRef.current = 0;
        if (!liftedRef.current) return;
        paintTransform(dragYRef.current, true);
      });
    };

    const detach = () => {
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", cancel, true);
      if (detachRef.current === detach) detachRef.current = null;
    };

    const cancel = (native: PointerEvent) => {
      if (native.pointerId !== pointerId || ended) return;
      ended = true;
      pointerDownRef.current = false;
      clearHoldTimer();
      detach();
      try {
        if (host.hasPointerCapture(pointerId)) host.releasePointerCapture(pointerId);
      } catch {
        // Already released.
      }
      resetLift();
    };

    const up = (native: PointerEvent) => {
      if (native.pointerId !== pointerId || ended) return;
      ended = true;
      pointerDownRef.current = false;
      clearHoldTimer();
      detach();
      try {
        if (host.hasPointerCapture(pointerId)) host.releasePointerCapture(pointerId);
      } catch {
        // Already released.
      }

      if (!liftedRef.current) return;
      if (moveFrameRef.current) {
        cancelAnimationFrame(moveFrameRef.current);
        moveFrameRef.current = 0;
      }

      const current = dockRef.current;
      const anchors = anchorsRef.current;
      const fromTop = anchors[current].top + dragYRef.current;
      const fromHeight = anchors[current].height;
      const center = fromTop + fromHeight / 2;
      const qrCenter = anchors.qr.top + anchors.qr.height / 2;
      const photoCenter = anchors.photo.top + anchors.photo.height / 2;
      const nearest: RailDock = Math.abs(center - qrCenter) <= Math.abs(center - photoCenter) ? "qr" : "photo";
      const stay = Math.abs(dragYRef.current) < REORDER_SLOP_PX;
      finishDock(stay ? current : nearest, fromTop, fromHeight);
    };

    detachRef.current = detach;
    document.addEventListener("pointermove", move, { passive: false, capture: true });
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", cancel, true);
  };

  const swallowClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const initial = anchorsRef.current[dockRef.current];

  return (
    <div
      ref={rootRef}
      className="absolute z-30 flex touch-none flex-col items-center justify-between bg-sky text-[var(--ink)] select-none [&_a]:text-current [&_button]:text-current [&_p]:text-current [&_span]:text-current [&_svg]:text-current"
      style={{
        top: layoutTop(initial.top),
        height: initial.height,
        right: 0,
        width: counterRightCss,
        touchAction: "none",
        transition: "none",
      }}
      onPointerDown={onPointerDown}
      onClickCapture={swallowClick}
      onTransitionEnd={onTransitionEnd}
    >
      <RailMark height={SHARE_PX}>
        <CardShareControl
          card={card}
          onShare={canShare ? share.handleShare : undefined}
          onPrepareShare={canShare ? share.primeShare : undefined}
          className="justify-center text-current"
        />
      </RailMark>
      <RailMark height={SCAN_PX}>
        <ScanButton className="justify-center text-current" />
      </RailMark>
      <RailMark height={PLUS_PX}>
        {showPlus ? (
          <NextScanMenu
            bare
            addons={getNextScanAddons(card)}
            onSetAddons={(addons) => updateCard(card.id, { nextScanAddons: addons })}
          />
        ) : null}
      </RailMark>
      <RailMark height={COUNT_PX}>
        <p className="text-center t-label text-[var(--ink)]" style={{ lineHeight: 1 }}>
          {index}/{total}
        </p>
      </RailMark>
    </div>
  );
}
