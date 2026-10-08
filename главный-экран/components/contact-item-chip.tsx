"use client";

import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { openHomeScreenAttachmentPdf } from "@/shared/components/pdf-preview-host";
import { ARRANGE_HOLD_MS, REORDER_SLOP_PX } from "@/shared/lib/reorder-hold";
import {
  applyRubricMove,
  composeCard,
  isChoosableHeader,
  orderCardZones,
  reorderIdsInGroup,
  zoneForItem,
  type CardDisplayRow,
  type CardZoneSection,
} from "@/shared/services/card-zones";
import type { ContactItem } from "@/shared/types";

export type ContactItemChipSize = "browse" | "compact";

const GRAB_IDLE_MS = 1500;

function prefersMotion() {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** How far a resting row or section moves while another one is held. */
export function rowShift(index: number, from: number, to: number, stride: number) {
  if (index === from) return 0;
  if (from < to && index > from && index <= to) return -stride;
  if (to < from && index >= to && index < from) return stride;
  return 0;
}

export function dropIndex(from: number, dy: number, stride: number, count: number) {
  if (stride <= 0) return from;
  const slots = Math.round(dy / stride);
  return Math.max(0, Math.min(count - 1, from + slots));
}

type ArrangeDrag = {
  kind: "rubric" | "item";
  zoneId: string;
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  index: number;
  count: number;
  stride: number;
  dy: number;
  active: boolean;
  dropZoneId: string;
  dropIndex: number;
  /** Pointer is over the card header: clear the section override. */
  home: boolean;
  /** Pointer is over a section that cannot take this row. */
  reject: boolean;
  settling: boolean;
};

const DRAG_LIFT =
  "relative z-[5] origin-center bg-white shadow-[0_10px_22px_rgba(20,20,20,0.14)]";

const SLOT_SPRING = "transform 320ms cubic-bezier(0.22, 1.15, 0.36, 1)";

function elementStride(nodes: HTMLElement[], index: number) {
  const node = nodes[index];
  if (!node) return 0;
  const rect = node.getBoundingClientRect();
  const neighbor = (nodes[index + 1] ?? nodes[index - 1])?.getBoundingClientRect();
  const stride = neighbor ? Math.abs(neighbor.top - rect.top) : rect.height;
  return stride || rect.height;
}

function reorderHaptic() {
  try {
    navigator.vibrate?.(10);
  } catch {
    // Vibration is blocked in some browsers.
  }
}

function cardHeader(list: HTMLElement) {
  const scroll = list.closest(".compass-card-scroll");
  const header = scroll?.parentElement?.previousElementSibling;
  return header instanceof HTMLElement ? header : null;
}

/** Where a held row would land. Only slots inside its own section count. */
function itemDropAt(list: HTMLElement, clientY: number, draggedId: string, zoneId: string) {
  const section = [...list.querySelectorAll<HTMLElement>("[data-rubric]")].find(
    (node) => node.dataset.rubric === zoneId,
  );
  if (!section) return null;
  const rows = [...section.querySelectorAll<HTMLElement>("[data-reorder-row]")].filter(
    (row) => row.dataset.reorderRow && row.dataset.reorderRow !== draggedId,
  );
  let index = rows.length;
  for (let slot = 0; slot < rows.length; slot += 1) {
    const rect = rows[slot]?.getBoundingClientRect();
    if (!rect) continue;
    // A long block counts as one stop: crossing its lower edge lands above the whole block.
    const boundary = rect.height > 96 ? rect.bottom : rect.top + rect.height / 2;
    if (clientY < boundary) {
      index = slot;
      break;
    }
  }
  return { zoneId, index, home: false, reject: false };
}

function readTranslateY(node: HTMLElement) {
  const match = /translateY\(([-\d.]+)px\)/.exec(node.style.transform);
  return match ? Number(match[1]) : 0;
}

/** One stop per section. The pointer hits the section box, never a row inside it. */
function sectionDropIndex(list: HTMLElement, clientY: number, from: number) {
  const sections = [...list.querySelectorAll<HTMLElement>("[data-rubric]")];
  if (sections.length === 0) return from;
  const boxes = sections.map((node) => {
    const top = node.getBoundingClientRect().top - readTranslateY(node);
    return { top, bottom: top + node.offsetHeight };
  });
  if (clientY <= boxes[0].top) return 0;
  for (let index = 0; index < boxes.length; index += 1) {
    if (clientY < boxes[index].bottom) return index;
  }
  return sections.length - 1;
}

function ContactItemChipRow({
  row,
  size,
  lifted,
  style,
  className,
  onChooseHeader,
}: {
  row: CardDisplayRow;
  size: ContactItemChipSize;
  lifted: boolean;
  style?: CSSProperties;
  className?: string;
  onChooseHeader?: (itemId: string) => void;
}) {
  const compact = size === "compact";
  const motion = typeof window !== "undefined" && prefersMotion();

  const line = row.axis ? `${row.axis} / ${row.value}` : row.value;
  const classNames = cn(
    "compass-type-value min-w-0 break-words text-left text-foreground select-none",
    lifted &&
      motion &&
      "origin-center scale-[1.03] rounded-full bg-sheet px-1.5 shadow-[0_10px_22px_rgba(20,20,20,0.14)] ring-1 ring-[rgba(20,20,20,0.28)] transition-[transform,box-shadow] duration-200 ease-out motion-reduce:scale-100 motion-reduce:transition-none motion-reduce:shadow-none",
    lifted && !motion && "rounded-full bg-sheet px-1.5 ring-1 ring-[rgba(20,20,20,0.28)]",
    className,
  );

  const body = line;

  if (!compact && row.item && row.url) {
    return (
      <a
        data-card-content
        data-preview-row={row.item.id}
        href={row.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event: MouseEvent) => {
          event.stopPropagation();
          if (row.item?.type === "pdf" && openHomeScreenAttachmentPdf(row.url, row.value || "PDF")) {
            event.preventDefault();
          }
        }}
        className={classNames}
        style={style}
      >
        {body}
      </a>
    );
  }

  return (
    <span
      data-card-content
      {...(row.item ? { "data-preview-row": row.item.id } : {})}
      onClick={
        isHeaderRole(row) && onChooseHeader && row.item
          ? (event) => {
              event.stopPropagation();
              onChooseHeader(row.item!.id);
            }
          : undefined
      }
      className={classNames}
      style={style}
    >
      {body}
    </span>
  );
}

function isHeaderRole(row: CardDisplayRow) {
  return Boolean(row.item && isChoosableHeader(row.item));
}

function EditorialValue({
  row,
  onChooseHeader,
  underlineLink = false,
}: {
  row: CardDisplayRow;
  onChooseHeader?: (itemId: string) => void;
  /** Public card: underline only the link value, not the platform prefix. */
  underlineLink?: boolean;
}) {
  const marked = underlineLink && Boolean(row.url);
  const value = marked ? (
    <span className="underline decoration-[#c9c6bf] underline-offset-[3px] [text-decoration-thickness:1px]">
      {row.value}
    </span>
  ) : (
    row.value
  );
  const choose = onChooseHeader && isHeaderRole(row);
  const body = (
    <span
      className={cn(
        "block min-w-0 break-words t-body text-[var(--ink)] no-underline",
        (row.value.includes("\n") || row.value.includes("  ")) && "whitespace-pre-wrap",
      )}
    >
      {row.axis ? (
        <>
          {row.axis}
          {" / "}
          {value}
        </>
      ) : (
        value
      )}
    </span>
  );

  if (row.item && row.url) {
    return (
      <a
        data-card-content
        href={row.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => {
          event.stopPropagation();
          if (row.item?.type === "pdf" && openHomeScreenAttachmentPdf(row.url, row.value || "PDF")) {
            event.preventDefault();
          }
        }}
        className="block min-w-0 no-underline"
      >
        {body}
      </a>
    );
  }

  return (
    <span
      data-card-content
      onClick={
        choose && row.item
          ? (event) => {
              event.stopPropagation();
              onChooseHeader?.(row.item!.id);
            }
          : undefined
      }
    >
      {body}
    </span>
  );
}

export function ContactItemChipList({
  items,
  size,
  className,
  listId,
  onReorder,
  onReorderRubrics,
  onMoveItem,
  rubricOrder,
  rubricLabels,
  itemZones,
  canReorder = false,
  onChooseHeader,
  underlineLinks = false,
  publicToken,
  pdfZoneIds = null,
  markPdfBlocks = false,
}: {
  items: ContactItem[];
  size: ContactItemChipSize;
  className?: string;
  listId?: string;
  onReorder?: (orderedIds: string[]) => void;
  onReorderRubrics?: (orderedKeys: string[]) => void;
  /** Drop a row into another section of this card. The item itself is not changed. */
  onMoveItem?: (itemId: string, zoneId: string, orderedIds: string[]) => void;
  /** Saved rubric order. Absent keeps Name, Company, Position, Web, … */
  rubricOrder?: string[];
  rubricLabels?: Record<string, string>;
  itemZones?: Record<string, string>;
  /** Owner card: a hold turns on arrange mode. Handles then drag at once. */
  canReorder?: boolean;
  onChooseHeader?: (itemId: string) => void;
  /** Public read-only card. The owner card keeps plain values. */
  underlineLinks?: boolean;
  /** Public token: link taps go through /r so a distributed card still counts. */
  publicToken?: string;
  /** Print sheet: only these zones, in the card's own order. */
  pdfZoneIds?: string[] | null;
  markPdfBlocks?: boolean;
}) {
  const compact = size === "compact";
  const listRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(items);
  const onReorderRef = useRef(onReorder);
  const onRubricRef = useRef(onReorderRubrics);
  const onMoveRef = useRef(onMoveItem);
  const rubricOrderRef = useRef(rubricOrder);
  const edgeX = useRef(0);
  const edgeY = useRef(0);
  const edgeLoop = useRef(0);
  const zonesRef = useRef<CardZoneSection[]>([]);
  const holdRef = useRef<ArrangeDrag | null>(null);
  const settleTimer = useRef<number | null>(null);
  const idleTimer = useRef<number | null>(null);
  const entryTimer = useRef<number | null>(null);
  const [hold, setHold] = useState<ArrangeDrag | null>(null);
  const [arranging, setArranging] = useState(false);
  const arrangingRef = useRef(false);
  const pointerDownRef = useRef(false);
  const arrangeMarker = useRef(false);
  const lastMoveRef = useRef(0);
  const edgeScrolling = useRef(false);
  const suppressClick = useRef(false);
  const detachGesture = useRef<(() => void) | null>(null);
  const cancelGrabRef = useRef<() => void>(() => {});
  const [fade, setFade] = useState({ top: false, bottom: false });
  const composed = composeCard(items, publicToken, { rubricLabels, itemZones });
  const orderedZones = orderCardZones(composed.zones, rubricOrder);
  const visualItems = orderedZones.flatMap((zone) =>
    zone.rows.flatMap((row) => (row.item ? [row.item] : [])),
  );
  const orderKey = visualItems.map((item) => item.id).join("|");

  useEffect(() => () => {
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
  }, []);

  useLayoutEffect(() => {
    itemsRef.current = visualItems;
    onReorderRef.current = onReorder;
    onRubricRef.current = onReorderRubrics;
    onMoveRef.current = onMoveItem;
    rubricOrderRef.current = rubricOrder;
    zonesRef.current = orderedZones;
  }, [visualItems, onReorder, onReorderRubrics, onMoveItem, rubricOrder, orderedZones]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const next = {
      top: el.scrollTop > 2,
      bottom: max > 2 && el.scrollTop < max - 2,
    };
    setFade((current) =>
      current.top === next.top && current.bottom === next.bottom ? current : next,
    );
  }, [orderKey]);

  useEffect(() => {
    return () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      if (settleTimer.current) window.clearTimeout(settleTimer.current);
      if (edgeLoop.current) cancelAnimationFrame(edgeLoop.current);
      detachGesture.current?.();
      document.removeEventListener("touchmove", blockTouchMove, true);
    };
  }, []);

  const motion = typeof window !== "undefined" && prefersMotion();

  const syncFade = () => {
    const el = listRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const next = {
      top: el.scrollTop > 2,
      bottom: max > 2 && el.scrollTop < max - 2,
    };
    setFade((current) => (current.top === next.top && current.bottom === next.bottom ? current : next));
  };

  const publishHold = (next: ArrangeDrag | null) => {
    holdRef.current = next;
    setHold(next ? { ...next } : null);
  };

  const clearEntry = () => {
    if (entryTimer.current) window.clearTimeout(entryTimer.current);
    entryTimer.current = null;
  };

  const stopIdle = () => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = null;
  };

  const stopEdgeScroll = () => {
    if (edgeLoop.current) cancelAnimationFrame(edgeLoop.current);
    edgeLoop.current = 0;
  };

  const pumpEdgeScroll = () => {
    const scroller = listRef.current?.closest(".compass-card-scroll");
    if (scroller instanceof HTMLElement) {
      const rect = scroller.getBoundingClientRect();
      const y = edgeY.current;
      const band = 56;
      const next = y < rect.top + band ? scroller.scrollTop - 12 : y > rect.bottom - band ? scroller.scrollTop + 12 : scroller.scrollTop;
      if (next !== scroller.scrollTop) {
        edgeScrolling.current = true;
        scroller.scrollTop = next;
        edgeScrolling.current = false;
      }
    }
    const current = holdRef.current;
    const list = listRef.current;
    if (current?.active && !current.settling && list) {
      if (current.kind === "rubric") {
        const to = sectionDropIndex(list, edgeY.current, current.index);
        if (noteDrop(current, { zoneId: current.zoneId, index: to, home: false, reject: false })) publishHold(current);
      } else if (current.kind === "item") {
        const drop = itemDropAt(list, edgeY.current, current.id, current.zoneId);
        if (drop && noteDrop(current, drop)) publishHold(current);
      }
    }
    edgeLoop.current = requestAnimationFrame(pumpEdgeScroll);
  };

  const noteDrop = (current: ArrangeDrag, drop: { zoneId: string; index: number; home: boolean; reject: boolean }) => {
    let zoneId = drop.zoneId;
    let index = drop.index;
    if (drop.home) {
      const item = itemsRef.current.find((entry) => entry.id === current.id);
      zoneId = item ? zoneForItem(item) : current.zoneId;
      index = 0;
    } else if (drop.reject) {
      zoneId = current.zoneId;
      index = current.index;
    }
    if (
      current.home === drop.home &&
      current.reject === drop.reject &&
      current.dropZoneId === zoneId &&
      current.dropIndex === index
    ) {
      return false;
    }
    current.home = drop.home;
    current.reject = drop.reject;
    current.dropZoneId = zoneId;
    current.dropIndex = index;
    if (!current.settling) reorderHaptic();
    return true;
  };

  const commitHold = (current: ArrangeDrag) => {
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
    settleTimer.current = null;
    holdRef.current = null;
    setHold(null);
    if (current.kind === "rubric") {
      const to = current.dropIndex;
      if (to === current.index) return;
      const visible = zonesRef.current.map((zone) => zone.id);
      onRubricRef.current?.(applyRubricMove(rubricOrderRef.current, visible, current.index, to));
      return;
    }
    const allIds = zonesRef.current.flatMap((entry) => entry.rows.flatMap((row) => (row.item ? [row.item.id] : [])));
    if (current.home || (current.dropZoneId && current.dropZoneId !== current.zoneId)) return;
    if (current.dropIndex === current.index) return;
    const zone = zonesRef.current.find((entry) => entry.id === current.zoneId);
    const groupIds = zone?.rows.flatMap((row) => (row.item ? [row.item.id] : [])) ?? [];
    onReorderRef.current?.(reorderIdsInGroup(allIds, groupIds, current.index, current.dropIndex));
  };

  const springHold = (current: ArrangeDrag) => {
    const list = listRef.current;
    const motion = typeof window !== "undefined" && prefersMotion();
    if (!list || !motion || current.kind !== "item") {
      commitHold(current);
      return;
    }
    const row = [...list.querySelectorAll<HTMLElement>("[data-reorder-row]")].find(
      (entry) => entry.dataset.reorderRow === current.id,
    );
    const layoutTop = row ? row.getBoundingClientRect().top - current.dy : 0;
    const zoneId = current.dropZoneId;
    const index = current.dropIndex;
    const section = [...list.querySelectorAll<HTMLElement>("[data-rubric]")].find((entry) => entry.dataset.rubric === zoneId);
    let targetTop = layoutTop;
    if (section) {
      const rows = [...section.querySelectorAll<HTMLElement>("[data-reorder-row]")].filter(
        (entry) => entry.dataset.reorderRow !== current.id,
      );
      const anchor = rows[index];
      if (anchor) {
        let shift = 0;
        if (current.dropZoneId === current.zoneId) {
          shift = rowShift(index, current.index, current.dropIndex, current.stride);
        } else if (index >= current.dropIndex) {
          shift = current.stride;
        }
        targetTop = anchor.getBoundingClientRect().top - shift;
      } else if (rows.length > 0) targetTop = rows[rows.length - 1].getBoundingClientRect().bottom;
      else targetTop = section.getBoundingClientRect().top + 36;
    }
    current.settling = true;
    publishHold(current);
    const nextDy = row ? targetTop - layoutTop : current.dy;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const live = holdRef.current;
        if (!live || live.pointerId !== current.pointerId) return;
        live.dy = nextDy;
        live.settling = true;
        publishHold(live);
        settleTimer.current = window.setTimeout(() => commitHold(live), 320);
      });
    });
  };

  const finishHold = (commit: boolean) => {
    clearEntry();
    stopIdle();
    stopEdgeScroll();
    document.removeEventListener("touchmove", blockTouchMove, true);
    const current = holdRef.current;
    if (!current) return;
    const list = listRef.current;
    if (list?.hasPointerCapture(current.pointerId)) {
      try {
        list.releasePointerCapture(current.pointerId);
      } catch {
        // The pointer is already gone.
      }
    }
    if (!current.active || !commit || current.reject) {
      holdRef.current = null;
      setHold(null);
      return;
    }
    if (current.home || current.kind === "rubric") {
      commitHold(current);
      return;
    }
    springHold(current);
  };

  const watchIdle = (pointerId: number) => {
    stopIdle();
    const tick = () => {
      const current = holdRef.current;
      if (!current?.active || current.pointerId !== pointerId || current.settling) return;
      if (!pointerDownRef.current && Date.now() - lastMoveRef.current >= GRAB_IDLE_MS) {
        finishHold(false);
        return;
      }
      idleTimer.current = window.setTimeout(tick, 300);
    };
    idleTimer.current = window.setTimeout(tick, GRAB_IDLE_MS);
  };

  const enterArrange = () => {
    if (arrangingRef.current) return;
    arrangingRef.current = true;
    setArranging(true);
    if (!arrangeMarker.current) {
      history.pushState({ compassArrange: 1 }, "");
      arrangeMarker.current = true;
    }
    reorderHaptic();
  };

  const leaveArrange = () => {
    arrangingRef.current = false;
    setArranging(false);
    finishHold(false);
    if (!arrangeMarker.current) return;
    arrangeMarker.current = false;
    if (history.state?.compassArrange) history.back();
  };

  cancelGrabRef.current = () => {
    clearEntry();
    pointerDownRef.current = false;
    const current = holdRef.current;
    if (current?.settling) return;
    detachGesture.current?.();
    if (current) finishHold(false);
  };

  const onBrowsePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canReorder || compact || !listRef.current) return;
    if (holdRef.current?.settling) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("[data-arrange-done]")) return;
    const fromArrange = arrangingRef.current;
    const handle = target.closest<HTMLElement>("[data-row-handle], [data-rubric-handle]");
    if (!fromArrange && target.closest("input, textarea")) return;

    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const host = event.currentTarget;
    pointerDownRef.current = true;
    lastMoveRef.current = Date.now();
    try {
      host.setPointerCapture(pointerId);
    } catch {
      // Capture fails if the pointer is already up.
    }

    if (fromArrange && handle) {
      const section = handle.closest<HTMLElement>("[data-rubric]");
      const zoneId = section?.dataset.rubric;
      const zones = zonesRef.current;
      const zone = zoneId ? zones.find((entry) => entry.id === zoneId) : undefined;
      if (section && zoneId && zone) {
        const row = handle.closest<HTMLElement>("[data-reorder-row]");
        let kind: ArrangeDrag["kind"] = "rubric";
        let id = zoneId;
        let index = zones.findIndex((entry) => entry.id === zoneId);
        let nodes = [...listRef.current.querySelectorAll<HTMLElement>("[data-rubric]")];
        let count = zones.length;
        const rowId = handle.hasAttribute("data-row-handle") ? row?.dataset.reorderRow : undefined;
        if (rowId) {
          const rows = [...section.querySelectorAll<HTMLElement>("[data-reorder-row]")];
          kind = "item";
          id = rowId;
          index = rows.findIndex((entry) => entry.dataset.reorderRow === rowId);
          nodes = rows;
          count = rows.length;
        }
        if (kind === "item" ? index >= 0 : zones.length >= 2) {
          suppressClick.current = true;
          document.addEventListener("touchmove", blockTouchMove, { passive: false, capture: true });
          reorderHaptic();
          publishHold({
            kind,
            zoneId,
            id,
            pointerId,
            startX,
            startY,
            index,
            count,
            stride: (kind === "rubric" ? section.offsetHeight : elementStride(nodes, index)) || 1,
            dy: 0,
            active: true,
            dropZoneId: zoneId,
            dropIndex: index,
            home: false,
            reject: false,
            settling: false,
          });
          stopEdgeScroll();
          edgeX.current = startX;
          edgeY.current = startY;
          edgeLoop.current = requestAnimationFrame(pumpEdgeScroll);
          watchIdle(pointerId);
        }
      }
    } else if (!fromArrange) {
      clearEntry();
      entryTimer.current = window.setTimeout(() => {
        entryTimer.current = null;
        if (!pointerDownRef.current) return;
        suppressClick.current = true;
        enterArrange();
      }, ARRANGE_HOLD_MS);
    }

    let ended = false;

    const move = (native: PointerEvent) => {
      if (native.pointerId !== pointerId) return;
      lastMoveRef.current = Date.now();
      const current = holdRef.current;
      const dx = native.clientX - startX;
      const dy = native.clientY - startY;
      if (!current?.active || current.pointerId !== pointerId) {
        if (Math.hypot(dx, dy) > REORDER_SLOP_PX) clearEntry();
        return;
      }
      if (current.settling) return;
      native.preventDefault();
      current.dy = dy;
      edgeX.current = native.clientX;
      edgeY.current = native.clientY;
      if (listRef.current) {
        if (current.kind === "rubric") {
          const to = sectionDropIndex(listRef.current, native.clientY, current.index);
          noteDrop(current, { zoneId: current.zoneId, index: to, home: false, reject: false });
        } else if (current.kind === "item") {
          const drop = itemDropAt(listRef.current, native.clientY, current.id, current.zoneId);
          if (drop) noteDrop(current, drop);
        }
      }
      publishHold(current);
    };

    function detach() {
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("keydown", onKey);
      host.removeEventListener("lostpointercapture", lost);
      if (detachGesture.current === detach) detachGesture.current = null;
    }

    const lost = (native: PointerEvent) => {
      if (native.pointerId !== pointerId) return;
      pointerDownRef.current = false;
      if (ended) return;
      ended = true;
      clearEntry();
      detach();
      if (holdRef.current?.active && !holdRef.current.settling) finishHold(native.buttons === 0);
    };

    const onKey = (native: KeyboardEvent) => {
      if (native.key !== "Escape") return;
      if (ended) return;
      ended = true;
      pointerDownRef.current = false;
      detach();
      finishHold(false);
    };

    const cancel = (native: PointerEvent) => {
      if (native.pointerId !== pointerId || ended) return;
      ended = true;
      pointerDownRef.current = false;
      clearEntry();
      detach();
      finishHold(false);
    };

    const up = (native: PointerEvent) => {
      if (native.pointerId !== pointerId || ended) return;
      ended = true;
      pointerDownRef.current = false;
      const dragging = Boolean(holdRef.current?.active && holdRef.current.pointerId === pointerId);
      detach();
      if (dragging) {
        finishHold(true);
        return;
      }
      clearEntry();
    };

    detachGesture.current = detach;
    document.addEventListener("pointermove", move, { passive: false, capture: true });
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", cancel, true);
    window.addEventListener("keydown", onKey);
    host.addEventListener("lostpointercapture", lost);
  };
  const swallowReorderClick = (event: MouseEvent<HTMLDivElement>) => {
    // While arranging, an accidental tap on a link or value must not open it. Done lives outside this list.
    if (!suppressClick.current && !arrangingRef.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const [chromeHost, setChromeHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!canReorder || compact) return;
    const scroller = listRef.current?.closest(".compass-card-scroll");
    const onScroll = () => {
      if (edgeScrolling.current) return;
      cancelGrabRef.current();
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") cancelGrabRef.current();
    };
    const onBlur = () => cancelGrabRef.current();
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("blur", onBlur);
    return () => {
      scroller?.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("blur", onBlur);
    };
  }, [canReorder, compact, orderKey]);

  useEffect(() => {
    if (!arranging) return;
    const onPop = () => {
      arrangeMarker.current = false;
      arrangingRef.current = false;
      setArranging(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [arranging]);

  useEffect(
    () => () => {
      if (!arrangeMarker.current) return;
      arrangeMarker.current = false;
      if (history.state?.compassArrange) history.back();
    },
    [],
  );

  useLayoutEffect(() => {
    if (!arranging) {
      setChromeHost(null);
      return;
    }
    const list = listRef.current;
    if (!list) return;
    const scroll = list.closest(".compass-card-scroll");
    // The non-scrolling card frame. Done floats here, so the scroller cannot eat the first tap.
    const frame = scroll?.parentElement ?? null;
    setChromeHost(frame instanceof HTMLElement ? frame : null);
    const header = cardHeader(list);
    const column = list.parentElement;
    const nodes: HTMLElement[] = [];
    if (header) nodes.push(header);
    if (column) {
      for (const child of column.children) {
        if (child === list || !(child instanceof HTMLElement) || child.dataset.arrangeChrome) continue;
        nodes.push(child);
      }
    }
    for (const node of nodes) node.style.opacity = "0.45";
    return () => {
      for (const node of nodes) node.style.opacity = "";
    };
  }, [arranging]);

  useLayoutEffect(() => {
    const list = listRef.current;
    const header = list ? cardHeader(list) : null;
    if (!header || !hold?.active || !hold.home) return;
    const prevBg = header.style.backgroundColor;
    const prevPos = header.style.position;
    const prevOpacity = header.style.opacity;
    header.style.backgroundColor = "var(--sky)";
    header.style.opacity = "1";
    if (getComputedStyle(header).position === "static") header.style.position = "relative";
    return () => {
      header.style.backgroundColor = prevBg;
      header.style.position = prevPos;
      header.style.opacity = prevOpacity;
    };
  }, [hold?.active, hold?.home]);

  useLayoutEffect(() => {
    if (!hold?.active || hold.kind !== "rubric" || hold.settling) return;
    const list = listRef.current;
    if (!list) return;
    const node = [...list.querySelectorAll<HTMLElement>("[data-rubric]")][hold.index];
    const stride = node?.offsetHeight ?? 0;
    if (!stride || Math.abs(stride - hold.stride) < 2) return;
    const current = holdRef.current;
    if (!current || current.kind !== "rubric" || current.id !== hold.id) return;
    current.stride = stride;
    publishHold(current);
  }, [hold?.active, hold?.kind, hold?.id, hold?.stride, hold?.settling]);

  if (orderedZones.length === 0) return null;

  if (!compact) {
    const zones = pdfZoneIds ? orderedZones.filter((zone) => pdfZoneIds.includes(zone.id)) : orderedZones;
    if (zones.length === 0) return null;
    const holdTarget = hold?.active && hold.kind === "rubric" ? hold.dropIndex : 0;
    const showReturn = Boolean(hold?.active && hold.kind === "item" && (hold.home || hold.reject));
    const header = listRef.current ? cardHeader(listRef.current) : null;
    return (
      <div
        ref={listRef}
        className={cn("relative w-full min-w-0", hold?.active && "touch-none", arranging && "pb-16", className)}
        data-card-chip-list={listId}
        data-card-content
        data-arranging={arranging ? "" : undefined}
        data-no-swipe={hold?.active || arranging ? "" : undefined}
        data-reordering={hold?.active ? "" : undefined}
        onPointerDown={canReorder ? onBrowsePointerDown : undefined}
        onClickCapture={swallowReorderClick}
        onContextMenu={(event) => {
          if (canReorder) event.preventDefault();
        }}
      >
        {showReturn && hold?.reject ? (
          <p className="pointer-events-none absolute inset-x-0 top-2 z-20 text-center t-meta text-[var(--ink)]">
            Return to its section
          </p>
        ) : null}
        {showReturn && hold?.home && header
          ? createPortal(
              <p className="pointer-events-none absolute inset-x-0 bottom-2 z-10 text-center t-meta text-[var(--ink)]">
                Return to its section
              </p>,
              header,
            )
          : null}
        {zones.map((zone) => {
          const zoneIndex = orderedZones.findIndex((entry) => entry.id === zone.id);
          const rubricLifted = Boolean(hold?.active && hold.kind === "rubric" && hold.id === zone.id);
          const rubricShift =
            hold?.active && hold.kind === "rubric" ? rowShift(zoneIndex, hold.index, holdTarget, hold.stride) : 0;
          const rubricTy = rubricLifted ? (hold?.dy ?? 0) : rubricShift;
          const sectionEntered = Boolean(
            hold?.active &&
              hold.kind === "item" &&
              !hold.home &&
              !hold.reject &&
              hold.dropZoneId === zone.id &&
              hold.zoneId !== zone.id,
          );
          return (
            <section
              key={zone.id}
              data-rubric={zone.id}
              data-pdf-block={markPdfBlocks ? "" : undefined}
              className={cn(
                "relative min-w-0 py-[18px]",
                zoneIndex < orderedZones.length - 1 && "border-b border-[var(--rule)]",
                rubricLifted && DRAG_LIFT,
                rubricLifted && "touch-none",
                sectionEntered && "bg-sky",
              )}
              style={
                rubricTy
                  ? {
                      transform: rubricLifted ? `translateY(${rubricTy}px) scale(1.03)` : `translateY(${rubricTy}px)`,
                      transition: rubricLifted || !motion ? "none" : "transform 250ms ease-out",
                    }
                  : undefined
              }
            >
              {arranging ? (
                <button
                  type="button"
                  data-rubric-handle=""
                  aria-label="Reorder section"
                  className="absolute top-[18px] z-10 flex size-6 touch-none items-center justify-center text-[var(--ink)]"
                  style={{ left: 62 }}
                >
                  <GripHorizontal className="size-4" strokeWidth={1.5} aria-hidden />
                </button>
              ) : null}
              <div className="grid grid-cols-[86px_minmax(0,1fr)] items-baseline gap-x-[14px]">
                <span className={cn("t-label block min-w-0 whitespace-normal line-clamp-3", arranging && "pr-6")}>
                  {zone.title}
                </span>
                <div className={cn("flex min-w-0 flex-col gap-[6px]", rubricLifted && "hidden")}>
                  {zone.rows.map((row, rowIndex) => {
                    const rowId = row.item?.id;
                    const itemLifted = Boolean(
                      hold?.active && hold.kind === "item" && hold.zoneId === zone.id && hold.id === rowId,
                    );
                    let itemShift = 0;
                    if (hold?.active && hold.kind === "item" && !itemLifted && !hold.reject) {
                      if (hold.zoneId === zone.id && hold.dropZoneId === zone.id && !hold.home) {
                        itemShift = rowShift(rowIndex, hold.index, hold.dropIndex, hold.stride);
                      } else if (hold.zoneId === zone.id && (hold.home || hold.dropZoneId !== zone.id) && rowIndex > hold.index) {
                        itemShift = -hold.stride;
                      } else if (!hold.home && hold.dropZoneId === zone.id && hold.zoneId !== zone.id && rowIndex >= hold.dropIndex) {
                        itemShift = hold.stride;
                      }
                    }
                    const itemTy = itemLifted ? (hold?.dy ?? 0) : itemShift;
                    return (
                      <div
                        key={row.key}
                        data-reorder-row={rowId}
                        className={cn("relative", itemLifted && DRAG_LIFT, itemLifted && "touch-none")}
                        style={
                          hold?.active &&
                          hold.kind === "item" &&
                          (itemLifted || hold.zoneId === zone.id || hold.dropZoneId === zone.id)
                            ? {
                                transform: itemLifted ? `translateY(${itemTy}px) scale(1.03)` : `translateY(${itemShift}px)`,
                                transition: !motion || (itemLifted && !hold.settling) ? "none" : SLOT_SPRING,
                              }
                            : undefined
                        }
                      >
                        <div className={cn("min-w-0", arranging && "pr-7")}>
                          <EditorialValue row={row} onChooseHeader={onChooseHeader} underlineLink={underlineLinks} />
                        </div>
                        {arranging ? (
                          <button
                            type="button"
                            data-row-handle=""
                            aria-label="Reorder row"
                            className="absolute top-0 right-0 flex size-6 touch-none items-center justify-center text-[var(--ink)]"
                          >
                            <GripHorizontal className="size-4" strokeWidth={1.5} aria-hidden />
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })}
        {arranging && chromeHost
          ? createPortal(
              <div data-arrange-chrome="" className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center">
                <button
                  type="button"
                  data-arrange-done=""
                  className="pointer-events-auto t-body bg-sky px-5 py-2 text-[var(--ink)]"
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerUp={(event) => {
                    event.stopPropagation();
                    leaveArrange();
                  }}
                >
                  Done
                </button>
              </div>,
              chromeHost,
            )
          : null}
      </div>
    );
  }
  return (
    <div className={cn("relative w-full", className)}>
      <div
        ref={listRef}
        data-card-content
        data-card-chip-list={listId}
        onScroll={syncFade}
        className="compass-preview-scroll mt-3 grid w-full min-w-0 grid-cols-[92px_minmax(0,1fr)] items-start gap-x-1.5 overflow-x-hidden"
      >
        {orderedZones.map((zone, zoneIndex) =>
          zone.rows.map((row, rowIndex) => {
            const zoneGap = zoneIndex > 0 && rowIndex === 0;
            const zoneEnd = rowIndex === zone.rows.length - 1;
            return (
              <Fragment key={row.key}>
                <span className={cn("pt-1 t-label whitespace-nowrap", zoneGap && "mt-3")}>
                  {rowIndex === 0 ? zone.title : null}
                </span>
                <ContactItemChipRow
                  row={row}
                  size={size}
                  lifted={false}
                  style={{
                    fontSize: 13,
                    fontWeight: 400,
                    letterSpacing: "-0.015em",
                    lineHeight: 1.35,
                    color: "#111",
                  }}
                  className={cn("min-w-0 t-meta text-[var(--ink)]", zoneGap && "mt-3")}
                  onChooseHeader={onChooseHeader}
                />
                {zoneEnd && zoneIndex < orderedZones.length - 1 ? (
                  <div className="col-span-2 mt-3 border-b border-[var(--rule)]" />
                ) : null}
              </Fragment>
            );
          }),
        )}
      </div>
      {fade.top ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-sheet to-transparent"
          style={{ height: 72 }}
        />
      ) : null}
      {fade.bottom ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-sheet to-transparent"
          style={{ height: 40 }}
        />
      ) : null}
    </div>
  );
}

function blockTouchMove(event: TouchEvent) {
  event.preventDefault();
}
