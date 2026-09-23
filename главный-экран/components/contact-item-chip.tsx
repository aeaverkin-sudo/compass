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
import { cn } from "@/lib/utils";
import { itemDisplayValue } from "@/shared/services/contact-item";
import { composeCard, FLUSH_PLAIN_VALUES, type CardDisplayRow } from "@/shared/services/card-zones";
import type { ContactItem } from "@/shared/types";
import { CardZoneHeading } from "./card-zone-heading";

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

function isDenseList(items: ContactItem[]) {
  return items.length >= 3 || items.some((item) => itemDisplayValue(item).length > 48);
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

function ContactItemChipRow({
  row,
  size,
  dense,
  lifted,
  style,
}: {
  row: CardDisplayRow;
  size: ContactItemChipSize;
  dense: boolean;
  lifted: boolean;
  style?: CSSProperties;
}) {
  const compact = size === "compact";
  const motion = typeof window !== "undefined" && prefersMotion();
  const flush = FLUSH_PLAIN_VALUES && !row.axis;
  const valueClass = cn(
    "min-w-0 truncate text-left font-semibold text-foreground",
    compact
      ? "text-[12px] leading-[1.4]"
      : dense
        ? "text-[14px] leading-[1.45]"
        : "text-[15px] leading-[1.5]",
  );

  const classNames = cn(
    "col-span-2 grid grid-cols-subgrid items-baseline select-none",
    compact ? (dense ? "py-1" : "py-2") : dense ? "py-2" : "py-1.5",
    lifted &&
      motion &&
      "origin-center scale-[1.03] rounded-full bg-sheet px-1.5 shadow-[0_10px_22px_rgba(20,20,20,0.14)] ring-1 ring-[rgba(20,20,20,0.28)] transition-[transform,box-shadow] duration-200 ease-out motion-reduce:scale-100 motion-reduce:transition-none motion-reduce:shadow-none",
    lifted && !motion && "rounded-full bg-sheet px-1.5 ring-1 ring-[rgba(20,20,20,0.28)]",
  );

  const body = (
    <>
      {flush ? null : (
        <span
          className={cn(
            "whitespace-nowrap text-left font-normal text-label",
            compact ? "text-[10px] leading-[1.3]" : "text-[13px] leading-[1.35]",
          )}
        >
          {row.axis}
        </span>
      )}
      <span className={cn("min-w-0", flush && "col-span-2", valueClass)}>{row.value}</span>
    </>
  );

  if (!compact && row.item && row.url) {
    return (
      <a
        data-card-content
        data-preview-row={row.item.id}
        href={row.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event: MouseEvent) => event.stopPropagation()}
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
      className={classNames}
      style={style}
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
}: {
  items: ContactItem[];
  size: ContactItemChipSize;
  className?: string;
  listId?: string;
  onReorder?: (orderedIds: string[]) => void;
}) {
  const dense = isDenseList(items);
  const compact = size === "compact";
  const listRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(items);
  const onReorderRef = useRef(onReorder);
  const liftRef = useRef<Lift | null>(null);
  const timerRef = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const detachGesture = useRef<(() => void) | null>(null);
  const pendingFlip = useRef<{ tops: Map<string, number>; orderKey: string } | null>(null);
  const [lift, setLift] = useState<Lift | null>(null);
  const composed = composeCard(items);
  const visualItems = composed.zones.flatMap((zone) =>
    zone.rows.flatMap((row) => (row.item ? [row.item] : [])),
  );
  const orderKey = visualItems.map((item) => item.id).join("|");

  useLayoutEffect(() => {
    itemsRef.current = visualItems;
    onReorderRef.current = onReorder;
  }, [visualItems, onReorder]);

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
      detachGesture.current?.();
      document.removeEventListener("touchmove", blockTouchMove);
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
    document.removeEventListener("touchmove", blockTouchMove);
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
    document.addEventListener("touchmove", blockTouchMove, { passive: false });
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
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
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

    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
  };

  const target = lift?.active
    ? dropIndex(lift.index, lift.dy, lift.stride, visualItems.length)
    : (lift?.index ?? 0);
  const motion = typeof window !== "undefined" && prefersMotion();

  if (composed.zones.length === 0) return null;

  return (
    <div
      ref={listRef}
      data-card-content
      data-card-chip-list={listId}
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
        "mx-auto grid w-full min-h-0 grid-cols-[72px_minmax(0,1fr)]",
        compact ? (dense ? "mt-3 gap-x-2 gap-y-0.5" : "mt-3 gap-x-2 gap-y-1") : "mt-5 gap-x-2 gap-y-1",
        className,
        lift?.active && "touch-none overflow-hidden",
      )}
    >
      {composed.zones.map((zone, zoneIndex) => (
        <Fragment key={zone.id}>
          <CardZoneHeading title={zone.title} className={zoneIndex === 0 ? undefined : "mt-4"} />
          {zone.rows.map((row) => {
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
            return (
              <ContactItemChipRow
                key={row.key}
                row={row}
                size={size}
                dense={dense}
                lifted={isLifted}
                style={style}
              />
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}

function blockTouchMove(event: TouchEvent) {
  event.preventDefault();
}
