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
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { openHomeScreenAttachmentPdf } from "@/shared/components/pdf-preview-host";
import { REORDER_HOLD_MS, REORDER_SLOP_PX, SECTION_EJECT_PX, SECTION_ENTER_PX } from "@/shared/lib/reorder-hold";
import {
  applyRubricMove,
  composeCard,
  isChoosableHeader,
  orderCardZones,
  placeItemInZone,
  reorderIdsInGroup,
  zoneForItem,
  type CardDisplayRow,
  type CardZoneSection,
} from "@/shared/services/card-zones";
import type { ContactItem } from "@/shared/types";

export type ContactItemChipSize = "browse" | "compact";

const LIFT_MS = 400;
const LIFT_SLOP_PX = 8;
const SETTLE_MS = 280;

function prefersMotion() {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** How far a resting row moves while another row is held. */
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

function moveItem(items: ContactItem[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return items;
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return items;
  next.splice(toIndex, 0, moved);
  return next;
}

function rowStride(list: HTMLElement, id: string) {
  const rows = [...list.querySelectorAll<HTMLElement>("[data-preview-row]")];
  const index = rows.findIndex((row) => row.dataset.previewRow === id);
  const row = rows[index];
  if (!row || index < 0) return { index: -1, stride: 0 };
  const rect = row.getBoundingClientRect();
  const neighbor = (rows[index + 1] ?? rows[index - 1])?.getBoundingClientRect();
  const stride = neighbor ? Math.abs(neighbor.top - rect.top) : rect.height;
  return { index, stride: stride || rect.height };
}

type Lift = {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  index: number;
  stride: number;
  dy: number;
  active: boolean;
};

type HoldDrag = {
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
  eject: boolean;
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

/** Where a held row would land. The held row itself is left out of the count. */
function itemDropAt(list: HTMLElement, clientY: number, draggedId: string) {
  const sections = [...list.querySelectorAll<HTMLElement>("[data-rubric]")];
  const first = sections[0]?.getBoundingClientRect();
  if (!first || sections.length === 0) return null;
  if (clientY < first.top - SECTION_EJECT_PX) return { zoneId: "", index: 0, eject: true };

  let section = sections[0];
  for (let i = 1; i < sections.length; i += 1) {
    const rect = sections[i]?.getBoundingClientRect();
    if (rect && clientY >= rect.top + SECTION_ENTER_PX) section = sections[i];
  }
  const zoneId = section?.dataset.rubric;
  if (!zoneId) return null;
  const rows = [...section.querySelectorAll<HTMLElement>("[data-reorder-row]")].filter(
    (row) => row.dataset.reorderRow && row.dataset.reorderRow !== draggedId,
  );
  let index = rows.length;
  for (let slot = 0; slot < rows.length; slot += 1) {
    const rect = rows[slot]?.getBoundingClientRect();
    if (!rect) continue;
    if (clientY < rect.top + rect.height / 2) {
      index = slot;
      break;
    }
  }
  return { zoneId, index, eject: false };
}

function InsertLine() {
  return <div aria-hidden className="h-px bg-[var(--ink)]" />;
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
        row.value.includes("\n") && "whitespace-pre-wrap",
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
  /** Owner card: long-press drags a rubric, or a row into any rubric. */
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
  const edgeY = useRef(0);
  const edgeLoop = useRef(0);
  const zonesRef = useRef<CardZoneSection[]>([]);
  const holdRef = useRef<HoldDrag | null>(null);
  const holdTimer = useRef<number | null>(null);
  const settleTimer = useRef<number | null>(null);
  const [hold, setHold] = useState<HoldDrag | null>(null);
  const liftRef = useRef<Lift | null>(null);
  const timerRef = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const detachGesture = useRef<(() => void) | null>(null);
  const pendingFlip = useRef<{ tops: Map<string, number>; orderKey: string } | null>(null);
  const [lift, setLift] = useState<Lift | null>(null);
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

  useLayoutEffect(() => {
    const pending = pendingFlip.current;
    const list = listRef.current;
    if (!pending || pending.orderKey !== orderKey || !list) return;
    pendingFlip.current = null;
    if (!prefersMotion()) return;

    const rows = [...list.querySelectorAll<HTMLElement>("[data-preview-row]")];
    const moved: HTMLElement[] = [];
    for (const row of rows) {
      const id = row.dataset.previewRow;
      const before = id ? pending.tops.get(id) : undefined;
      if (before == null) continue;
      const dy = before - row.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) continue;
      row.style.transition = "none";
      row.style.transform = `translateY(${dy}px)`;
      moved.push(row);
    }
    requestAnimationFrame(() => {
      for (const row of moved) {
        row.style.transition = `transform ${SETTLE_MS}ms ease-out`;
        row.style.transform = "";
      }
    });
  }, [orderKey]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (holdTimer.current) window.clearTimeout(holdTimer.current);
      if (edgeLoop.current) cancelAnimationFrame(edgeLoop.current);
      detachGesture.current?.();
      document.removeEventListener("touchmove", blockTouchMove, true);
    };
  }, []);

  const clearTimer = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const publish = (next: Lift | null) => {
    liftRef.current = next;
    setLift(next ? { ...next } : null);
  };

  const finish = (commit: boolean) => {
    clearTimer();
    document.removeEventListener("touchmove", blockTouchMove, true);
    const current = liftRef.current;
    liftRef.current = null;
    if (!current?.active || !commit) {
      setLift(null);
      return;
    }
    const list = itemsRef.current;
    const to = dropIndex(current.index, current.dy, current.stride, list.length);
    if (to !== current.index && listRef.current) {
      const tops = new Map<string, number>();
      for (const row of listRef.current.querySelectorAll<HTMLElement>("[data-preview-row]")) {
        const id = row.dataset.previewRow;
        if (id) tops.set(id, row.getBoundingClientRect().top);
      }
      const next = moveItem(list, current.index, to);
      const ids = next.map((item) => item.id);
      pendingFlip.current = { tops, orderKey: ids.join("|") };
      onReorderRef.current?.(ids);
    }
    setLift(null);
  };

  const arm = (pointerId: number) => {
    const current = liftRef.current;
    if (!current || current.pointerId !== pointerId || current.active) return;
    current.active = true;
    suppressClick.current = true;
    document.addEventListener("touchmove", blockTouchMove, { passive: false, capture: true });
    publish(current);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!compact || !onReorderRef.current || !listRef.current || liftRef.current) return;
    const row = (event.target as HTMLElement).closest<HTMLElement>("[data-preview-row]");
    if (!row?.dataset.previewRow) return;

    const id = row.dataset.previewRow;
    const { index, stride } = rowStride(listRef.current, id);
    if (index < 0) return;

    const pointerId = event.pointerId;
    publish({
      id,
      pointerId,
      startX: event.clientX,
      startY: event.clientY,
      index,
      stride,
      dy: 0,
      active: false,
    });

    clearTimer();
    timerRef.current = window.setTimeout(() => arm(pointerId), LIFT_MS);
    event.currentTarget.setPointerCapture(pointerId);

    const move = (native: PointerEvent) => {
      if (native.pointerId !== pointerId) return;
      const current = liftRef.current;
      if (!current) return;
      const dy = native.clientY - current.startY;
      const dx = native.clientX - current.startX;
      if (!current.active) {
        if (Math.hypot(dx, dy) > LIFT_SLOP_PX) {
          clearTimer();
          publish(null);
          detach();
        }
        return;
      }
      native.preventDefault();
      current.dy = dy;
      publish(current);
    };

    function detach() {
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", up, true);
      const list = listRef.current;
      if (list?.hasPointerCapture(pointerId)) list.releasePointerCapture(pointerId);
      if (detachGesture.current === detach) detachGesture.current = null;
    }

    const up = (native: PointerEvent) => {
      if (native.pointerId !== pointerId) return;
      detach();
      finish(true);
    };
    detachGesture.current = detach;

    document.addEventListener("pointermove", move, { passive: false, capture: true });
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", up, true);
  };

  const target = lift?.active
    ? dropIndex(lift.index, lift.dy, lift.stride, visualItems.length)
    : (lift?.index ?? 0);
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

  const publishHold = (next: HoldDrag | null) => {
    holdRef.current = next;
    setHold(next ? { ...next } : null);
  };

  const clearHoldTimer = () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
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
      if (y < rect.top + band) scroller.scrollTop -= 12;
      else if (y > rect.bottom - band) scroller.scrollTop += 12;
    }
    const current = holdRef.current;
    const list = listRef.current;
    if (current?.active && !current.settling && current.kind === "item" && list) {
      const drop = itemDropAt(list, edgeY.current, current.id);
      if (drop && noteDrop(current, drop)) publishHold(current);
    }
    edgeLoop.current = requestAnimationFrame(pumpEdgeScroll);
  };

  const noteDrop = (current: HoldDrag, drop: { zoneId: string; index: number; eject: boolean }) => {
    let zoneId = drop.zoneId;
    let index = drop.index;
    if (drop.eject) {
      const item = itemsRef.current.find((entry) => entry.id === current.id);
      zoneId = item ? zoneForItem(item) : current.zoneId;
      index = 0;
    }
    if (current.eject === drop.eject && current.dropZoneId === zoneId && current.dropIndex === index) return false;
    current.eject = drop.eject;
    current.dropZoneId = zoneId;
    current.dropIndex = index;
    if (!current.settling) reorderHaptic();
    return true;
  };

  const commitHold = (current: HoldDrag) => {
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
    settleTimer.current = null;
    holdRef.current = null;
    setHold(null);
    if (current.kind === "rubric") {
      const to = dropIndex(current.index, current.dy, current.stride, current.count);
      if (to === current.index) return;
      const visible = zonesRef.current.map((zone) => zone.id);
      onRubricRef.current?.(applyRubricMove(rubricOrderRef.current, visible, current.index, to));
      return;
    }
    const allIds = zonesRef.current.flatMap((entry) => entry.rows.flatMap((row) => (row.item ? [row.item.id] : [])));
    if (current.eject) {
      const item = itemsRef.current.find((entry) => entry.id === current.id);
      const natural = item ? zoneForItem(item) : current.zoneId;
      const targetIds =
        zonesRef.current
          .find((entry) => entry.id === natural)
          ?.rows.flatMap((row) => (row.item ? [row.item.id] : [])) ?? [];
      onMoveRef.current?.(current.id, natural, placeItemInZone(allIds, current.id, targetIds, 0));
      return;
    }
    if (current.dropZoneId && current.dropZoneId !== current.zoneId) {
      const targetIds =
        zonesRef.current
          .find((entry) => entry.id === current.dropZoneId)
          ?.rows.flatMap((row) => (row.item ? [row.item.id] : [])) ?? [];
      onMoveRef.current?.(
        current.id,
        current.dropZoneId,
        placeItemInZone(allIds, current.id, targetIds, current.dropIndex),
      );
      return;
    }
    if (current.dropIndex === current.index) return;
    const zone = zonesRef.current.find((entry) => entry.id === current.zoneId);
    const groupIds = zone?.rows.flatMap((row) => (row.item ? [row.item.id] : [])) ?? [];
    onReorderRef.current?.(reorderIdsInGroup(allIds, groupIds, current.index, current.dropIndex));
  };

  const springHold = (current: HoldDrag) => {
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
    let zoneId = current.dropZoneId;
    let index = current.dropIndex;
    if (current.eject) {
      const item = itemsRef.current.find((entry) => entry.id === current.id);
      zoneId = item ? zoneForItem(item) : current.zoneId;
      index = 0;
    }
    const section = [...list.querySelectorAll<HTMLElement>("[data-rubric]")].find((entry) => entry.dataset.rubric === zoneId);
    let targetTop = layoutTop;
    if (section) {
      const rows = [...section.querySelectorAll<HTMLElement>("[data-reorder-row]")].filter(
        (entry) => entry.dataset.reorderRow !== current.id,
      );
      const anchor = rows[index];
      if (anchor) {
        let shift = 0;
        if (current.eject) {
          if (zoneId === current.zoneId && index > current.index) shift = -current.stride;
        } else if (current.dropZoneId === current.zoneId) {
          shift = rowShift(index, current.index, current.dropIndex, current.stride);
        } else if (index >= current.dropIndex) {
          shift = current.stride;
        }
        targetTop = anchor.getBoundingClientRect().top - shift;
      }
      else if (rows.length > 0) targetTop = rows[rows.length - 1].getBoundingClientRect().bottom;
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
    clearHoldTimer();
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
    if (!current.active || !commit) {
      holdRef.current = null;
      setHold(null);
      return;
    }
    if (current.kind === "rubric") {
      commitHold(current);
      return;
    }
    springHold(current);
  };

  const armHold = (pointerId: number) => {
    const current = holdRef.current;
    if (!current || current.pointerId !== pointerId || current.active) return;
    current.active = true;
    suppressClick.current = true;
    document.addEventListener("touchmove", blockTouchMove, { passive: false, capture: true });
    try {
      listRef.current?.setPointerCapture(pointerId);
    } catch {
      // Capture fails if the pointer is already up.
    }
    reorderHaptic();
    stopEdgeScroll();
    edgeLoop.current = requestAnimationFrame(pumpEdgeScroll);
    publishHold(current);
  };

  const onBrowsePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canReorder || compact || holdRef.current || !listRef.current) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest("input, textarea, button")) return;
    const section = target.closest<HTMLElement>("[data-rubric]");
    const zoneId = section?.dataset.rubric;
    if (!section || !zoneId) return;
    const row = target.closest<HTMLElement>("[data-reorder-row]");
    const zones = zonesRef.current;
    const zone = zones.find((entry) => entry.id === zoneId);
    if (!zone) return;

    let kind: HoldDrag["kind"] = "rubric";
    let id = zoneId;
    let index = zones.findIndex((entry) => entry.id === zoneId);
    let nodes = [...listRef.current.querySelectorAll<HTMLElement>("[data-rubric]")];
    let count = zones.length;
    if (row?.dataset.reorderRow) {
      const rows = [...section.querySelectorAll<HTMLElement>("[data-reorder-row]")];
      kind = "item";
      id = row.dataset.reorderRow;
      index = rows.findIndex((entry) => entry.dataset.reorderRow === id);
      nodes = rows;
      count = rows.length;
      if (index < 0) return;
    } else if (zones.length < 2) {
      return;
    }

    const pointerId = event.pointerId;
    publishHold({
      kind,
      zoneId,
      id,
      pointerId,
      startX: event.clientX,
      startY: event.clientY,
      index,
      count,
      stride: elementStride(nodes, index),
      dy: 0,
      active: false,
      dropZoneId: zoneId,
      dropIndex: index,
      eject: false,
      settling: false,
    });
    clearHoldTimer();
    holdTimer.current = window.setTimeout(() => armHold(pointerId), REORDER_HOLD_MS);

    const move = (native: PointerEvent) => {
      if (native.pointerId !== pointerId) return;
      const current = holdRef.current;
      if (!current) return;
      const dx = native.clientX - current.startX;
      const dy = native.clientY - current.startY;
      if (!current.active) {
        if (Math.hypot(dx, dy) > REORDER_SLOP_PX) {
          clearHoldTimer();
          publishHold(null);
          detach();
        }
        return;
      }
      native.preventDefault();
      native.stopPropagation();
      current.dy = dy;
      edgeY.current = native.clientY;
      if (current.kind === "item" && !current.settling && listRef.current) {
        const drop = itemDropAt(listRef.current, native.clientY, current.id);
        if (drop) noteDrop(current, drop);
      }
      publishHold(current);
    };

    function detach() {
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", up, true);
      window.removeEventListener("keydown", onKey);
      if (detachGesture.current === detach) detachGesture.current = null;
    }

    const onKey = (native: KeyboardEvent) => {
      if (native.key !== "Escape") return;
      detach();
      finishHold(false);
    };

    const up = (native: PointerEvent) => {
      if (native.pointerId !== pointerId) return;
      detach();
      finishHold(true);
    };

    detachGesture.current = detach;
    document.addEventListener("pointermove", move, { passive: false, capture: true });
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", up, true);
    window.addEventListener("keydown", onKey);
  };

  const swallowReorderClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  if (orderedZones.length === 0) return null;

  if (!compact) {
    const zones = pdfZoneIds ? orderedZones.filter((zone) => pdfZoneIds.includes(zone.id)) : orderedZones;
    if (zones.length === 0) return null;
    const holdTarget = hold?.active ? dropIndex(hold.index, hold.dy, hold.stride, hold.count) : 0;
    const draggedItem = hold?.kind === "item" ? items.find((item) => item.id === hold.id) : undefined;
    const ejectZoneId = hold?.active && hold.eject && draggedItem ? zoneForItem(draggedItem) : "";
    return (
      <div
        ref={listRef}
        className={cn("w-full min-w-0", hold?.active && "touch-none", className)}
        data-card-chip-list={listId}
        data-card-content
        data-no-swipe={hold?.active ? "" : undefined}
        data-reordering={hold?.active ? "" : undefined}
        onPointerDown={canReorder ? onBrowsePointerDown : undefined}
        onClickCapture={swallowReorderClick}
        onContextMenu={(event) => {
          if (canReorder) event.preventDefault();
        }}
      >
        {zones.map((zone) => {
          const zoneIndex = orderedZones.findIndex((entry) => entry.id === zone.id);
          const rubricLifted = Boolean(hold?.active && hold.kind === "rubric" && hold.id === zone.id);
          const rubricShift =
            hold?.active && hold.kind === "rubric"
              ? rowShift(zoneIndex, hold.index, holdTarget, hold.stride)
              : 0;
          const rubricTy = rubricLifted ? hold?.dy ?? 0 : rubricShift;
          const rubricLine = Boolean(hold?.active && hold.kind === "rubric" && holdTarget === zoneIndex && hold.index !== zoneIndex);
          const sectionEntered = Boolean(
            hold?.active &&
              hold.kind === "item" &&
              ((ejectZoneId && ejectZoneId === zone.id) ||
                (!hold.eject && hold.dropZoneId === zone.id && hold.zoneId !== zone.id)),
          );
          let itemSlot = 0;
          return (
          <Fragment key={zone.id}>
          {rubricLine ? <InsertLine /> : null}
          <section
            data-rubric={zone.id}
            data-pdf-block={markPdfBlocks ? "" : undefined}
            className={cn(
              "min-w-0 py-[18px]",
              zoneIndex < orderedZones.length - 1 && "border-b border-[var(--rule)]",
              rubricLifted && DRAG_LIFT,
              sectionEntered && "bg-sky",
            )}
            style={
              rubricTy
                ? {
                    transform: `translateY(${rubricTy}px)`,
                    transition: rubricLifted || !motion ? "none" : "transform 250ms ease-out",
                  }
                : undefined
            }
          >
            <div className="grid grid-cols-[86px_minmax(0,1fr)] items-baseline gap-x-[14px]">
              <span
                data-rubric-handle=""
                className="t-label flex items-center gap-1 whitespace-nowrap"
              >
                {rubricLifted ? <GripVertical className="size-3.5 shrink-0 text-[var(--ink)]" strokeWidth={1.5} aria-hidden /> : null}
                {zone.title}
              </span>
              <div className="flex min-w-0 flex-col gap-[6px]">
                {zone.rows.map((row, rowIndex) => {
                  const rowId = row.item?.id;
                  const itemLifted = Boolean(
                    hold?.active && hold.kind === "item" && hold.zoneId === zone.id && hold.id === rowId,
                  );
                  let itemShift = 0;
                  if (hold?.active && hold.kind === "item" && !itemLifted) {
                    if (hold.zoneId === zone.id && hold.dropZoneId === zone.id) {
                      itemShift = rowShift(rowIndex, hold.index, hold.dropIndex, hold.stride);
                    } else if (hold.zoneId === zone.id && (hold.eject || hold.dropZoneId !== zone.id) && rowIndex > hold.index) {
                      itemShift = -hold.stride;
                    } else if (hold.dropZoneId === zone.id && hold.zoneId !== zone.id && rowIndex >= hold.dropIndex) {
                      itemShift = hold.stride;
                    }
                  }
                  const itemTy = itemLifted ? hold?.dy ?? 0 : itemShift;
                  const showItemLine = Boolean(
                    hold?.active && hold.kind === "item" && hold.dropZoneId === zone.id && !itemLifted && itemSlot === hold.dropIndex,
                  );
                  if (!itemLifted) itemSlot += 1;
                  return (
                    <Fragment key={row.key}>
                      {showItemLine ? <InsertLine /> : null}
                      <div
                        data-reorder-row={rowId}
                        className={cn(itemLifted && DRAG_LIFT)}
                        style={
                          hold?.active &&
                          hold.kind === "item" &&
                          (itemLifted || hold.zoneId === zone.id || hold.dropZoneId === zone.id)
                            ? {
                                transform: itemLifted
                                  ? `translateY(${itemTy}px) scale(1.03)`
                                  : `translateY(${itemShift}px)`,
                                transition: !motion || (itemLifted && !hold.settling) ? "none" : SLOT_SPRING,
                              }
                            : undefined
                        }
                      >
                        <EditorialValue
                          row={row}
                          onChooseHeader={onChooseHeader}
                          underlineLink={underlineLinks}
                        />
                      </div>
                    </Fragment>
                  );
                })}
                {hold?.active && hold.kind === "item" && hold.dropZoneId === zone.id && itemSlot === hold.dropIndex ? (
                  <InsertLine />
                ) : null}
              </div>
            </div>
          </section>
          </Fragment>
          );
        })}
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
        onPointerDown={compact && onReorder ? onPointerDown : undefined}
        onClick={(event) => {
          if (!suppressClick.current) return;
          suppressClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        onContextMenu={(event) => {
          if (compact && onReorder) event.preventDefault();
        }}
        className={cn(
          "compass-preview-scroll mt-3 grid w-full min-w-0 grid-cols-[92px_minmax(0,1fr)] items-start gap-x-1.5 overflow-x-hidden",
          lift?.active && "touch-none overflow-hidden",
        )}
      >
        {orderedZones.map((zone, zoneIndex) =>
          zone.rows.map((row, rowIndex) => {
            const index = row.item ? visualItems.findIndex((item) => item.id === row.item?.id) : -1;
            const isLifted = Boolean(row.item && lift?.active && lift.id === row.item.id);
            const shift = lift?.active && index >= 0 ? rowShift(index, lift.index, target, lift.stride) : 0;
            const ty = isLifted ? (lift?.dy ?? 0) : shift;
            const style: CSSProperties | undefined =
              lift?.active && ty
                ? {
                    transform: `translateY(${ty}px)`,
                    transition: isLifted || !motion ? "none" : "transform 250ms ease-out",
                    zIndex: isLifted ? 5 : undefined,
                  }
                : isLifted
                  ? { zIndex: 5 }
                  : undefined;
            const zoneGap = zoneIndex > 0 && rowIndex === 0;
            const zoneEnd = rowIndex === zone.rows.length - 1;
            return (
              <Fragment key={row.key}>
                <span
                  className={cn(
                    "pt-1 t-label whitespace-nowrap",
                    zoneGap && "mt-3",
                  )}
                >
                  {rowIndex === 0 ? zone.title : null}
                </span>
                <ContactItemChipRow
                  row={row}
                  size={size}
                  lifted={isLifted}
                  style={{
                    ...style,
                    fontSize: 13,
                    fontWeight: 400,
                    letterSpacing: "-0.015em",
                    lineHeight: 1.35,
                    color: "#111",
                  }}
                  className={cn(
                    "min-w-0 t-meta text-[var(--ink)]",
                    zoneGap && "mt-3",
                  )}
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
