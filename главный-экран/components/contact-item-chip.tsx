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
  onDragStart,
  onDragEnter,
  onDragEnd,
}: {
  item: ContactItem;
  size: ContactItemChipSize;
  dense: boolean;
  previewReorder?: PreviewReorderProps;
  onEnterReorder?: () => void;
  dragging?: boolean;
  dropTarget?: boolean;
  onDragStart?: () => void;
  onDragEnter?: () => void;
  onDragEnd?: () => void;
}) {
  const label = rowTypeLabel(item);
  const display = itemDisplayValue(item);
  const compact = size === "compact";
  const reorderActive = Boolean(previewReorder?.active);
  const interactivePreview = compact && Boolean(previewReorder);

  const longPress = useLongPress(() => {
    onEnterReorder?.();
    previewReorder?.onEnter();
  }, PREVIEW_LONG_PRESS_MS);

  const classNames = cn(
    "col-span-2 grid grid-cols-subgrid items-center touch-none select-none transition-transform duration-150",
    compact ? (dense ? "py-0.5" : "py-1.5") : dense ? "py-1" : "py-2",
    reorderActive && "rounded-lg bg-[oklch(97%_0.004_70)] px-1.5 ring-1 ring-hairline/35",
    reorderActive && !dragging && "scale-[1.02]",
    dragging && "z-10 scale-[1.04] opacity-80 shadow-sm",
    dropTarget && !dragging && "ring-2 ring-hairline/60",
  );

  const pointerProps = interactivePreview
    ? reorderActive
      ? {
          onPointerDown: (event: PointerEvent) => {
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            onDragStart?.();
          },
          onPointerEnter: () => onDragEnter?.(),
          onPointerUp: (event: PointerEvent) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            onDragEnd?.();
          },
          onPointerCancel: (event: PointerEvent) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            onDragEnd?.();
          },
        }
      : {
          onPointerDown: (event: PointerEvent) => longPress.onPointerDown(event),
          onPointerMove: (event: PointerEvent) => longPress.onPointerMove(event),
          onPointerUp: longPress.onPointerUp,
          onPointerCancel: longPress.onPointerCancel,
          onPointerLeave: longPress.onPointerLeave,
          onClick: (event: MouseEvent) => longPress.onClick(event),
          onContextMenu: (event: MouseEvent) => longPress.onContextMenu(event),
        }
    : {};

  const body = (
    <>
      <span
        className={cn(
          "whitespace-nowrap text-right font-light text-hairline",
          compact ? "text-[10px] leading-[1.2]" : "text-[12px] leading-[1.25]",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "flex min-w-0 items-center gap-1",
          reorderActive && "font-semibold",
        )}
      >
        <span
          className={cn(
            "min-w-0 whitespace-normal wrap-anywhere break-words text-left font-semibold text-foreground",
            compact
              ? "text-[12px] leading-[1.25]"
              : dense
                ? "text-[14px] leading-[1.2]"
                : "text-[14px] leading-[1.35]",
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
    <span data-card-content data-preview-row={item.id} className={classNames} {...pointerProps}>
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
  const [draftItems, setDraftItems] = useState(items);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const draftRef = useRef(items);
  const movedRef = useRef(false);

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
  }, [items]);

  const displayedItems = reorderActive ? draftItems : items;

  const handleDragStart = useCallback((itemId: string) => {
    draggingIdRef.current = itemId;
    movedRef.current = false;
    setDraggingId(itemId);
    setOverId(itemId);
  }, []);

  const handleDragEnter = useCallback(
    (itemId: string) => {
      const activeId = draggingIdRef.current;
      if (!activeId || activeId === itemId) return;

      setDraftItems((current) => {
        const fromIndex = current.findIndex((item) => item.id === activeId);
        const toIndex = current.findIndex((item) => item.id === itemId);
        if (fromIndex === toIndex) return current;
        movedRef.current = true;
        const next = moveItem(current, fromIndex, toIndex);
        draftRef.current = next;
        return next;
      });
      setOverId(itemId);
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    if (!draggingIdRef.current) return;
    draggingIdRef.current = null;
    setDraggingId(null);
    setOverId(null);
    if (!movedRef.current || !previewReorder) return;
    previewReorder.onCommit(draftRef.current.map((item) => item.id));
    movedRef.current = false;
  }, [previewReorder]);

  if (displayedItems.length === 0) return null;

  return (
    <div
      data-card-content
      data-reorder-active={reorderActive || undefined}
      className={cn(
        "mx-auto grid w-full grid-cols-[auto_minmax(0,1fr)]",
        compact
          ? dense
            ? "mt-2 max-w-[220px] gap-x-1 gap-y-0.5"
            : "mt-3 max-w-[220px] gap-x-1 gap-y-1.5"
          : dense
            ? "mt-4 max-w-[280px] gap-x-1.5 gap-y-1"
            : "mt-8 max-w-[280px] gap-x-1.5 gap-y-2",
        reorderActive && "gap-y-1.5",
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
          onDragStart={() => handleDragStart(item.id)}
          onDragEnter={() => handleDragEnter(item.id)}
          onDragEnd={handleDragEnd}
        />
      ))}
    </div>
  );
}
