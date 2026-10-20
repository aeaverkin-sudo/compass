"use client";

import {
  memo,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type TransitionEvent,
} from "react";
import { Ellipsis } from "lucide-react";
import { ScanButton } from "@/shared/components/scan-icon";
import { CardShareControl, useCardShare } from "@/shared/components/card-share-control";
import { getNextScanAddons } from "@/shared/services/card-snapshot";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { railLookClass } from "@/shared/lib/photo-look";
import { RAIL_HOLD_MS, REORDER_SLOP_PX } from "@/shared/lib/reorder-hold";
import { useAppStore } from "@/shared/store/app-store";
import type { Card } from "@/shared/types";
import { cn } from "@/lib/utils";
import { MARK_PX, RAIL_STROKE_PX } from "@/shared/components/mark-plus";
import { BROWSE_QR_SIZE, HERO_PHOTO_PX, layoutTop, railPhotoTopFromQrTop, readHeaderScale } from "../layout";
import { NextScanMenu } from "./next-scan-menu";

const SHIELD_EVENTS = [
  "pointerdown",
  "pointermove",
  "pointerup",
  "touchstart",
  "touchmove",
  "click",
  "contextmenu",
] as const;

/** Slot heights in the rail column. The size-11 tap sits on each slot and does not enter the column. */
const SHARE_SLOT_PX = 16.1;
const SCAN_SLOT_PX = 16.1;
const PLUS_SLOT_PX = 18;
const COUNT_SLOT_PX = 11;
/** Micro sky inset so Share and the sheet count sit just inside the plate edges. */
const EDGE_INSET_PX = 2;
/** Share and Scan keep RAIL_STROKE_PX on screen at any svg size. The plus keeps its own stroke. */
const SCREEN_STROKE_CLASS = "[&_svg_*]:[vector-effect:non-scaling-stroke]";

const FREEZE_CLASS =
  "select-none [-webkit-touch-callout:none] [-webkit-user-drag:none]";

type RailDock = "qr" | "photo";
type RailLook = "shadow";

const LOOKS: { look: RailLook | null; label: string }[] = [
  { look: null, label: "BASIC" },
  { look: "shadow", label: "SHADOW" },
];
type Anchor = { top: number; height: number };

function RailMark({
  height,
  inert,
  children,
}: {
  height: number;
  inert: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn("relative w-full shrink-0", FREEZE_CLASS)}
      style={{ height }}
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {children != null ? (
        <div
          className={cn(
            "absolute top-1/2 left-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center",
            FREEZE_CLASS,
            inert
              ? "pointer-events-none [&_*]:!pointer-events-none"
              : "pointer-events-auto",
          )}
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
          onContextMenu={(event) => event.preventDefault()}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function measureAnchors(rail: HTMLElement, fallbackQrTop: number): { qr: Anchor; photo: Anchor } {
  const shell = rail.closest(".compass-main");
  const scale = readHeaderScale();
  const photoPx = HERO_PHOTO_PX * scale;
  const fallback = {
    qr: { top: fallbackQrTop, height: Math.round(BROWSE_QR_SIZE * scale) },
    photo: { top: railPhotoTopFromQrTop(fallbackQrTop, scale), height: photoPx },
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
      if (Math.abs(rect.width - photoPx) < 1.5 && Math.abs(rect.height - photoPx) < 1.5) {
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

function sameRailCard(a: Card, b: Card) {
  return (
    a.id === b.id &&
    a.publicToken === b.publicToken &&
    a.handle === b.handle &&
    a.displayName === b.displayName &&
    a.photoAttachmentId === b.photoAttachmentId &&
    a.nextScanAddons === b.nextScanAddons
  );
}

/** One rail is on screen. Keep the last card object when a tap only changes rows, so the rail does not redraw. */
const railCardCache = new Map<string, Card>();

function selectRailCard(cards: Card[], cardId: string, fallback: Card) {
  const found = cards.find((entry) => entry.id === cardId) ?? fallback;
  const cached = railCardCache.get(cardId);
  if (cached && sameRailCard(cached, found)) return cached;
  railCardCache.set(cardId, found);
  return found;
}

export const SideRail = memo(function SideRail({
  qrTop,
  counterRightCss,
  card,
  index,
  total,
  showPlus,
  frozen,
  editing = false,
}: {
  qrTop: number;
  counterRightCss: string;
  card: Card;
  index: number;
  total: number;
  showPlus: boolean;
  frozen: boolean;
  editing?: boolean;
}) {
  const cardId = card.id;
  const liveCard = useAppStore((state) => selectRailCard(state.cards, cardId, card));
  const updateCard = useAppStore((state) => state.updateCard);
  const setRailDock = useAppStore((state) => state.setRailDock);
  const railDock = useAppStore((state) => (state.user.railDock === "photo" ? "photo" : "qr"));
  const railLook = useAppStore((state) => (state.user.railLook === "shadow" ? "shadow" : undefined));
  const setRailLook = useAppStore((state) => state.setRailLook);
  const share = useCardShare(liveCard);
  const canShare = Boolean(liveCard.publicToken) && !frozen;

  const rootRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<RailDock>(railDock);
  const anchorsRef = useRef({
    qr: { top: qrTop, height: Math.round(BROWSE_QR_SIZE * readHeaderScale()) },
    photo: { top: railPhotoTopFromQrTop(qrTop, readHeaderScale()), height: HERO_PHOTO_PX * readHeaderScale() },
  });
  const pointerDownRef = useRef(false);
  const holdTimerRef = useRef<number | null>(null);
  const startRef = useRef({ x: 0, y: 0, pointerId: -1 });
  const draggingRef = useRef(false);
  const settlingRef = useRef(false);
  const dragYRef = useRef(0);
  const moveFrameRef = useRef(0);
  const detachRef = useRef<(() => void) | null>(null);
  const touchBlockRef = useRef<((event: TouchEvent) => void) | null>(null);
  const shieldRef = useRef<HTMLDivElement | null>(null);
  const shieldSwallowRef = useRef<((event: Event) => void) | null>(null);
  const [dragging, setDragging] = useState(false);
  const [styling, setStyling] = useState(false);

  useEffect(() => {
    if (!styling) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-slot='dropdown-menu-content']")) return;
      if (rootRef.current?.contains(target as Node)) return;
      setStyling(false);
      requestAnimationFrame(() => {
        rootRef.current?.getBoundingClientRect();
      });
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [styling]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    for (const node of root.querySelectorAll<HTMLElement>("a, button, img, svg, p, span, div")) {
      node.draggable = false;
      node.setAttribute("draggable", "false");
    }
  }, [liveCard.id, liveCard.nextScanAddons, showPlus, dragging]);

  const mountShield = () => {
    if (shieldRef.current || typeof document === "undefined") return;
    const shield = document.createElement("div");
    shield.setAttribute("aria-hidden", "true");
    shield.style.cssText = "position:fixed;inset:0;z-index:29;touch-action:none;";
    const swallow = (event: Event) => {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
    };
    shieldSwallowRef.current = swallow;
    for (const type of SHIELD_EVENTS) {
      shield.addEventListener(type, swallow, { capture: true, passive: false });
    }
    document.body.appendChild(shield);
    shieldRef.current = shield;
  };

  const unmountShield = () => {
    const shield = shieldRef.current;
    if (!shield) return;
    const swallow = shieldSwallowRef.current;
    if (swallow) {
      for (const type of SHIELD_EVENTS) {
        shield.removeEventListener(type, swallow, true);
      }
    }
    shield.remove();
    shieldRef.current = null;
    shieldSwallowRef.current = null;
  };

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
    if (!node || draggingRef.current || settlingRef.current) return;
    anchorsRef.current = measureAnchors(node, qrTop);
    paintDock(dockRef.current, { transition: "none", clearTransform: true });
  };

  const endLiftVisual = () => {
    const node = rootRef.current;
    if (!node) return;
    node.style.boxShadow = "";
  };

  const stopTouchBlock = () => {
    if (!touchBlockRef.current) return;
    document.removeEventListener("touchmove", touchBlockRef.current);
    touchBlockRef.current = null;
  };

  const suppressNextClick = () => {
    const swallow = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("click", swallow, { capture: true, once: true });
    // iOS often sends no click after a drag; a lingering swallow would eat the next real tap anywhere.
    window.setTimeout(() => document.removeEventListener("click", swallow, { capture: true }), 500);
  };

  const resetLift = () => {
    draggingRef.current = false;
    setDragging(false);
    settlingRef.current = false;
    dragYRef.current = 0;
    stopTouchBlock();
    unmountShield();
    if (moveFrameRef.current) {
      cancelAnimationFrame(moveFrameRef.current);
      moveFrameRef.current = 0;
    }
    const node = rootRef.current;
    if (node) {
      node.style.transition = "none";
      node.style.transform = "";
      node.style.boxShadow = "";
    }
    paintDock(dockRef.current, { transition: "none" });
  };

  const releaseCapture = () => {
    const node = rootRef.current;
    const pointerId = startRef.current.pointerId;
    if (!node || pointerId < 0) return;
    try {
      if (node.hasPointerCapture(pointerId)) node.releasePointerCapture(pointerId);
    } catch {
      // Already released.
    }
  };

  const cancelGesture = () => {
    const wasDragging = draggingRef.current;
    clearHoldTimer();
    pointerDownRef.current = false;
    detachRef.current?.();
    detachRef.current = null;
    releaseCapture();
    resetLift();
    if (wasDragging) suppressNextClick();
  };

  useEffect(() => {
    const node = rootRef.current;
    if (editing) {
      dockRef.current = "photo";
      if (node) {
        node.style.transition = "top 460ms ease-out, height 460ms ease-out";
        node.style.top = layoutTop(qrTop);
        node.style.height = `${HERO_PHOTO_PX * readHeaderScale()}px`;
      }
      const timer = window.setTimeout(() => {
        if (node) node.style.transition = "none";
        syncAnchors();
      }, 480);
      return () => window.clearTimeout(timer);
    }
    dockRef.current = railDock;
    if (node) node.style.transition = "top 460ms ease-out, height 460ms ease-out";
    syncAnchors();
    const timer = window.setTimeout(() => {
      if (node) node.style.transition = "none";
    }, 480);
    return () => window.clearTimeout(timer);
  }, [railDock, qrTop, liveCard.id, editing]);

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
  }, [qrTop, liveCard.id]);

  useEffect(() => {
    const onScroll = () => {
      if (pointerDownRef.current && !draggingRef.current) cancelGesture();
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") cancelGesture();
    };
    const onBlur = () => cancelGesture();
    const onPageHide = () => cancelGesture();
    const scroller = document.querySelector(".compass-card-scroll");
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      scroller?.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pagehide", onPageHide);
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
    draggingRef.current = false;
    setDragging(false);
    settlingRef.current = true;
    stopTouchBlock();
    unmountShield();
    endLiftVisual();
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
    paintDock(dockRef.current, { transition: "none" });
    setRailDock(dockRef.current);
  };

  const onPointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (settlingRef.current || draggingRef.current) return;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const host = event.currentTarget;
    pointerDownRef.current = true;
    startRef.current = { x: startX, y: startY, pointerId };
    clearHoldTimer();
    syncAnchors();
    let ended = false;
    try {
      host.setPointerCapture(pointerId);
    } catch {
      // Capture fails if the pointer is already up.
    }

    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      if (!pointerDownRef.current || ended) return;
      draggingRef.current = true;
      setDragging(true);
      setStyling(true);
      dragYRef.current = 0;
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      try {
        host.setPointerCapture(pointerId);
      } catch {
        // Capture fails if the pointer is already up.
      }
      mountShield();
      if (!touchBlockRef.current) {
        const blockTouchMove = (native: TouchEvent) => {
          if (native.cancelable) native.preventDefault();
        };
        touchBlockRef.current = blockTouchMove;
        document.addEventListener("touchmove", blockTouchMove, { passive: false });
      }
      host.removeEventListener("pointermove", move);
      host.addEventListener("pointermove", move, { passive: false });
      host.style.transition = "transform 120ms ease-out, box-shadow 120ms ease-out";
      host.style.boxShadow = "0 6px 18px rgba(0,0,0,.14)";
      paintTransform(0, true);
      requestAnimationFrame(() => {
        if (!rootRef.current || !draggingRef.current) return;
        rootRef.current.style.transition = "none";
      });
    }, RAIL_HOLD_MS);

    const move = (native: PointerEvent) => {
      if (native.pointerId !== pointerId) return;
      const dx = native.clientX - startX;
      const dy = native.clientY - startY;
      if (!draggingRef.current) {
        if (Math.hypot(dx, dy) > REORDER_SLOP_PX) clearHoldTimer();
        return;
      }
      if (native.cancelable) native.preventDefault();
      dragYRef.current = dy;
      if (moveFrameRef.current) return;
      moveFrameRef.current = requestAnimationFrame(() => {
        moveFrameRef.current = 0;
        if (!draggingRef.current) return;
        paintTransform(dragYRef.current, true);
      });
    };

    const detach = () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerup", up);
      host.removeEventListener("pointercancel", cancel);
      if (detachRef.current === detach) detachRef.current = null;
    };

    const cancel = (native: PointerEvent) => {
      if (native.pointerId !== pointerId || ended) return;
      ended = true;
      const wasDragging = draggingRef.current;
      pointerDownRef.current = false;
      clearHoldTimer();
      detach();
      releaseCapture();
      resetLift();
      if (wasDragging) suppressNextClick();
    };

    const up = (native: PointerEvent) => {
      if (native.pointerId !== pointerId || ended) return;
      ended = true;
      pointerDownRef.current = false;
      clearHoldTimer();
      detach();
      releaseCapture();

      if (!draggingRef.current) return;
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
      const nearest: RailDock =
        Math.abs(center - qrCenter) <= Math.abs(center - photoCenter) ? "qr" : "photo";
      const stay = Math.abs(dragYRef.current) < REORDER_SLOP_PX;
      finishDock(stay ? current : nearest, fromTop, fromHeight);
      suppressNextClick();
    };

    detachRef.current = detach;
    host.addEventListener("pointermove", move, { passive: true });
    host.addEventListener("pointerup", up);
    host.addEventListener("pointercancel", cancel);
  };

  const initial = anchorsRef.current[dockRef.current];

  return (
    <div
      ref={rootRef}
      data-side-rail
      className={cn(
        "absolute z-30 flex touch-none flex-col items-center justify-between bg-sky text-[var(--ink)]",
        FREEZE_CLASS,
        railLookClass(railLook),
        "[&_a]:text-current [&_button]:text-current [&_p]:text-current [&_span]:text-current [&_svg]:text-current",
        "[&_a]:select-none [&_a]:[-webkit-touch-callout:none] [&_a]:[-webkit-user-drag:none]",
        "[&_button]:select-none [&_button]:[-webkit-touch-callout:none] [&_button]:[-webkit-user-drag:none]",
      )}
      style={{
        top: layoutTop(initial.top),
        height: initial.height,
        right: 0,
        width: counterRightCss,
        paddingTop: EDGE_INSET_PX,
        paddingBottom: EDGE_INSET_PX,
        touchAction: "none",
        transition: "none",
        willChange: "transform",
      }}
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDownCapture={onPointerDownCapture}
      onTransitionEnd={onTransitionEnd}
    >
      <div
        className={cn(
          "absolute bottom-full left-1/2 flex size-11 -translate-x-1/2 items-center justify-center",
          styling ? "visible opacity-100" : "invisible pointer-events-none opacity-0",
          styling && dragging && "pointer-events-none",
        )}
        aria-hidden={!styling}
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Rail style"
            className="flex size-11 items-center justify-center text-[var(--ink)]"
          >
            <Ellipsis className="size-4" strokeWidth={1.5} aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom" className="min-w-0 px-4 py-3">
            {LOOKS.map(({ look, label }) => {
              const on = (railLook ?? null) === look;
              return (
                <DropdownMenuItem key={label} onSelect={() => setRailLook(look)}>
                  <span className={cn("t-body", on ? "text-[var(--ink)]" : "text-[var(--grey)]")}>{label}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <RailMark height={SHARE_SLOT_PX} inert={dragging}>
        <CardShareControl
          card={liveCard}
          onShare={canShare ? share.handleShare : undefined}
          onPrepareShare={canShare ? share.primeShare : undefined}
          size={MARK_PX}
          stroke={RAIL_STROKE_PX}
          className={cn("justify-center text-current", SCREEN_STROKE_CLASS, FREEZE_CLASS)}
        />
      </RailMark>
      <RailMark height={SCAN_SLOT_PX} inert={dragging}>
        <ScanButton
          size={MARK_PX}
          stroke={RAIL_STROKE_PX}
          className={cn("justify-center text-current", SCREEN_STROKE_CLASS, FREEZE_CLASS)}
        />
      </RailMark>
      <RailMark height={PLUS_SLOT_PX} inert={dragging}>
        {showPlus ? (
          <NextScanMenu
            bare
            addons={getNextScanAddons(liveCard)}
            onSetAddons={(addons) => updateCard(liveCard.id, { nextScanAddons: addons })}
          />
        ) : null}
      </RailMark>
      <RailMark height={COUNT_SLOT_PX} inert={dragging}>
        <p className="text-center t-caps font-light leading-none text-[var(--ink)]">
          {index}/{total}
        </p>
      </RailMark>
    </div>
  );
}, (prev, next) =>
  prev.qrTop === next.qrTop &&
  prev.counterRightCss === next.counterRightCss &&
  prev.index === next.index &&
  prev.total === next.total &&
  prev.showPlus === next.showPlus &&
  prev.frozen === next.frozen &&
  prev.editing === next.editing &&
  prev.card.id === next.card.id,
);
