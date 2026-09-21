"use client";

import { GripVertical } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { cn } from "@/lib/utils";
import { useLongPress } from "@/shared/hooks/use-long-press";
import { itemDisplayValue, rowTypeLabel } from "@/shared/services/contact-item";
import type { ContactItem } from "@/shared/types";

export type ContactItemChipSize = "browse" | "compact";

const PREVIEW_LONG_PRESS_MS = 500;
const DRAG_START_PX = 8;

/** 3+ rows or a long wrap — pack to half the open browse rhythm. */
function isDenseList(items: ContactItem[]) {
  return (
    items.length >= 3 || items.some((item) => itemDisplayValue(item).length > 48)
  );
}

type PreviewReorderProps = {
  active: boolean;
  onEnter: () => void;
  onExit: () => void;
  onCommit: (orderedIds: string[]) => void;
};

function ContactItemChipRow({
  item,
  size,
  dense,
  previewReorder,
  onEnterReorder,
  dragging,
  dropTarget,
}: {
  item: ContactItem;
  size: ContactItemChipSize;
  dense: boolean;
  previewReorder?: PreviewReorderProps;
  onEnterReorder?: () => void;
  dragging?: boolean;
  dropTarget?: boolean;
}) {
  const label = rowTypeLabel(item);
  const display = itemDisplayValue(item);
  const compact = size === "compact";
  const reorderActive = Boolean(previewReorder?.active);
  const interactivePreview = compact && Boolean(previewReorder) && !reorderActive;

  const longPress = useLongPress(() => {
    onEnterReorder?.();
    previewReorder?.onEnter();
  }, PREVIEW_LONG_PRESS_MS);

  const classNames = cn(
    "col-span-2 grid grid-cols-subgrid items-center select-none",
    compact ? (dense ? "py-1" : "py-2") : dense ? "py-2" : "py-4",
    reorderActive && "rounded-lg bg-sheet px-1.5 ring-1 ring-[rgba(20,20,20,0.55)]",
    dragging && "z-10 opacity-80 shadow-sm",
    dropTarget && !dragging && "ring-2 ring-hairline/60",
  );

  const longPressProps = interactivePreview
    ? {
        onPointerDown: longPress.onPointerDown,
        onPointerMove: longPress.onPointerMove,
        onPointerUp: longPress.onPointerUp,
        onPointerCancel: longPress.onPointerCancel,
        onPointerLeave: longPress.onPointerLeave,
        onClick: longPress.onClick,
        onContextMenu: longPress.onContextMenu,
      }
    : {};

  const body = (
    <>
      <span
        className={cn(
          "whitespace-nowrap text-left font-normal text-label",
          compact ? "text-[10px] leading-[1.3]" : "text-[13px] leading-[1.35]",
        )}
      >
        {label}
      </span>
      <span className="flex min-w-0 items-center gap-1">
        <span
          className={cn(
            "min-w-0 whitespace-normal wrap-anywhere break-words text-left font-semibold text-foreground",
            compact
              ? "text-[12px] leading-[1.4]"
              : dense
                ? "text-[14px] leading-[1.45]"
                : "text-[15px] leading-[1.5]",
          )}
        >
          {display}
        </span>
        {reorderActive ? (
          <GripVertical
            className="size-3.5 shrink-0 text-hairline"
            strokeWidth={1.5}
            aria-hidden
          />
        ) : null}
      </span>
    </>
  );

  if (!compact && item.url) {
    return (
      <a
        data-card-content
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event: MouseEvent) => event.stopPropagation()}
        className={classNames}
      >
        {body}
      </a>
    );
  }

  return (
    <span
      data-card-content
      data-preview-row={item.id}
      className={classNames}
      {...longPressProps}
    >
      {body}
    </span>
  );
}

function moveItem(items: ContactItem[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return items;
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return items;
  next.splice(toIndex, 0, moved);
  return next;
}

function rowIdFromPoint(list: HTMLElement, clientY: number) {
  for (const row of list.querySelectorAll<HTMLElement>("[data-preview-row]")) {
    const rect = row.getBoundingClientRect();
    if (clientY >= rect.top && clientY <= rect.bottom) {
      return row.dataset.previewRow ?? null;
    }
  }
  return null;
}

export function ContactItemChipList({
  items,
  size,
  className,
  previewReorder,
}: {
  items: ContactItem[];
  size: ContactItemChipSize;
  className?: string;
  previewReorder?: PreviewReorderProps;
}) {
  const dense = isDenseList(items);
  const compact = size === "compact";
  const reorderActive = Boolean(previewReorder?.active);
  const listRef = useRef<HTMLDivElement>(null);
  const [draftItems, setDraftItems] = useState(items);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const draftRef = useRef(items);
  const movedRef = useRef(false);
  const dragRef = useRef<{ startY: number; moved: boolean } | null>(null);

  useEffect(() => {
    draftRef.current = draftItems;
  }, [draftItems]);

  useEffect(() => {
    if (reorderActive || !movedRef.current || !previewReorder) return;
    previewReorder.onCommit(draftRef.current.map((item) => item.id));
    movedRef.current = false;
  }, [reorderActive, previewReorder]);

  const enterReorder = useCallback(() => {
    draftRef.current = items;
    setDraftItems(items);
    movedRef.current = false;
    setDraggingId(null);
    setOverId(null);
    draggingIdRef.current = null;
    dragRef.current = null;
  }, [items]);

  const exitReorder = useCallback(() => {
    previewReorder?.onExit();
  }, [previewReorder]);

  const displayedItems = reorderActive ? draftItems : items;

  const swapToRow = useCallback((targetId: string) => {
    const activeId = draggingIdRef.current;
    if (!activeId || activeId === targetId) return;

    setDraftItems((current) => {
      const fromIndex = current.findIndex((item) => item.id === activeId);
      const toIndex = current.findIndex((item) => item.id === targetId);
      if (fromIndex === toIndex) return current;
      movedRef.current = true;
      const next = moveItem(current, fromIndex, toIndex);
      draftRef.current = next;
      return next;
    });
    setOverId(targetId);
  }, []);

  const handleListPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!reorderActive) return;

      const row = (event.target as HTMLElement).closest("[data-preview-row]");
      if (!row) {
        event.stopPropagation();
        exitReorder();
        return;
      }

      const itemId = row.getAttribute("data-preview-row");
      if (!itemId) return;

      event.stopPropagation();
      draggingIdRef.current = itemId;
      dragRef.current = { startY: event.clientY, moved: false };
      setDraggingId(itemId);
      setOverId(itemId);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [exitReorder, reorderActive],
  );

  const handleListPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!reorderActive || !dragRef.current || !draggingIdRef.current || !listRef.current) return;

      if (Math.abs(event.clientY - dragRef.current.startY) >= DRAG_START_PX) {
        dragRef.current.moved = true;
      }

      const targetId = rowIdFromPoint(listRef.current, event.clientY);
      if (targetId) swapToRow(targetId);
    },
    [reorderActive, swapToRow],
  );

  const finishDrag = useCallback(() => {
    if (dragRef.current?.moved && previewReorder) {
      previewReorder.onCommit(draftRef.current.map((item) => item.id));
      movedRef.current = false;
    }
    draggingIdRef.current = null;
    dragRef.current = null;
    setDraggingId(null);
    setOverId(null);
  }, [previewReorder]);

  const handleListPointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!reorderActive) return;

      event.stopPropagation();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (dragRef.current?.moved) {
        finishDrag();
      }

      exitReorder();
    },
    [exitReorder, finishDrag, reorderActive],
  );

  const handleListPointerCancel = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!reorderActive) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      finishDrag();
      exitReorder();
    },
    [exitReorder, finishDrag, reorderActive],
  );

  if (displayedItems.length === 0) return null;

  return (
    <div
      ref={listRef}
      data-card-content
      data-reorder-list
      data-reorder-active={reorderActive || undefined}
      onPointerDown={reorderActive ? handleListPointerDown : undefined}
      onPointerMove={reorderActive ? handleListPointerMove : undefined}
      onPointerUp={reorderActive ? handleListPointerUp : undefined}
      onPointerCancel={reorderActive ? handleListPointerCancel : undefined}
      className={cn(
        "mx-auto grid w-full shrink-0 grid-cols-[auto_minmax(0,1fr)]",
        compact
          ? dense
            ? "mt-3 max-w-[220px] gap-x-1 gap-y-0.5"
            : "mt-3 max-w-[220px] gap-x-1 gap-y-1.5"
          : dense
            ? "mt-4 max-w-[280px] gap-x-1.5 gap-y-1"
            : "mt-8 max-w-[280px] gap-x-1.5 gap-y-4",
        reorderActive && "touch-none gap-y-1.5",
        className,
      )}
    >
      {displayedItems.map((item) => (
        <ContactItemChipRow
          key={item.id}
          item={item}
          size={size}
          dense={dense}
          previewReorder={previewReorder}
          onEnterReorder={enterReorder}
          dragging={reorderActive && draggingId === item.id}
          dropTarget={reorderActive && overId === item.id && draggingId !== item.id}
        />
      ))}
    </div>
  );
}
