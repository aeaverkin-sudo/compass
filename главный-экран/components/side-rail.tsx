"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
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

function dockTop(dock: RailDock, qrTop: number, photoTop: number) {
  return dock === "qr" ? qrTop : photoTop;
}

function dockHeight(dock: RailDock) {
  return dock === "qr" ? BROWSE_QR_SIZE : HERO_PHOTO_PX;
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
  const photoTop = railPhotoTopFromQrTop(qrTop);
  const updateCard = useAppStore((state) => state.updateCard);
  const setRailDock = useAppStore((state) => state.setRailDock);
  const railDock = useAppStore((state) => state.user.railDock === "photo" ? "photo" : "qr");
  const share = useCardShare(card);
  const canShare = Boolean(card.publicToken) && !frozen;

  const rootRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<RailDock>(railDock);
  const pointerDownRef = useRef(false);
  const holdTimerRef = useRef<number | null>(null);
  const startRef = useRef({ x: 0, y: 0, pointerId: -1 });
  const liftedRef = useRef(false);
  const dragYRef = useRef(0);
  const suppressClickRef = useRef(false);
  const detachRef = useRef<(() => void) | null>(null);

  const [dock, setDock] = useState<RailDock>(railDock);
  const [lifted, setLifted] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [settling, setSettling] = useState(false);

  dockRef.current = dock;

  useEffect(() => {
    if (liftedRef.current || settling) return;
    setDock(railDock);
  }, [railDock, settling]);

  const clearHoldTimer = () => {
    if (holdTimerRef.current == null) return;
    window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  };

  const resetLift = () => {
    liftedRef.current = false;
    dragYRef.current = 0;
    setLifted(false);
    setDragY(0);
    setSettling(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cancel only while mounted
  }, []);

  const finishDock = (next: RailDock, fromTop: number) => {
    const toTop = dockTop(next, qrTop, photoTop);
    setDock(next);
    dockRef.current = next;
    setRailDock(next);
    liftedRef.current = false;
    setLifted(false);
    const offset = fromTop - toTop;
    dragYRef.current = offset;
    setDragY(offset);
    setSettling(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        dragYRef.current = 0;
        setDragY(0);
      });
    });
    window.setTimeout(() => setSettling(false), 260);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (settling || liftedRef.current) return;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const host = event.currentTarget;
    pointerDownRef.current = true;
    startRef.current = { x: startX, y: startY, pointerId };
    clearHoldTimer();

    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      if (!pointerDownRef.current) return;
      suppressClickRef.current = true;
      liftedRef.current = true;
      setLifted(true);
      try {
        host.setPointerCapture(pointerId);
      } catch {
        // Capture fails if the pointer is already up.
      }
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
      setDragY(dy);
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

      const current = dockRef.current;
      const fromTop = dockTop(current, qrTop, photoTop) + dragYRef.current;
      const fromHeight = dockHeight(current);
      const center = fromTop + fromHeight / 2;
      const qrCenter = qrTop + BROWSE_QR_SIZE / 2;
      const photoCenter = photoTop + HERO_PHOTO_PX / 2;
      const nearest: RailDock = Math.abs(center - qrCenter) <= Math.abs(center - photoCenter) ? "qr" : "photo";
      const stay = Math.abs(dragYRef.current) < REORDER_SLOP_PX;
      const next = stay ? current : nearest;
      finishDock(next, fromTop);
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

  const top = dockTop(dock, qrTop, photoTop);
  const height = dockHeight(dock);
  const transition = settling
    ? "transform 250ms ease-out, height 250ms ease-out, top 250ms ease-out, box-shadow 120ms ease-out"
    : lifted
      ? "transform 120ms ease-out, box-shadow 120ms ease-out"
      : "transform 120ms ease-out, box-shadow 120ms ease-out, height 250ms ease-out, top 250ms ease-out";

  return (
    <div
      ref={rootRef}
      className="absolute z-30 flex touch-none flex-col items-center justify-between bg-sky text-[var(--ink)] select-none [&_a]:text-current [&_button]:text-current [&_p]:text-current [&_span]:text-current [&_svg]:text-current"
      style={{
        top: layoutTop(top),
        height,
        right: 0,
        width: counterRightCss,
        transform: `translateY(${dragY}px)${lifted ? " scale(1.04)" : ""}`,
        boxShadow: lifted ? "0 6px 18px rgba(0,0,0,.14)" : "none",
        transition,
        touchAction: "none",
      }}
      onPointerDown={onPointerDown}
      onClickCapture={swallowClick}
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
