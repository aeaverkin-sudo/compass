"use client";

import { memo, useEffect, useRef, type ComponentProps, type PointerEvent } from "react";
import { MarkPlus } from "@/shared/components/mark-plus";
import { REORDER_SLOP_PX } from "@/shared/lib/reorder-hold";
import { TabBand } from "./tab-band";

const EDIT_CLICK_GUARD_MS = 400;

/** Fires on the finger lifting; the click Safari sends after it is dropped, keyboard clicks still work. */
function TapButton({ onTap, ...props }: Omit<ComponentProps<"button">, "onClick" | "onPointerUp"> & { onTap: () => void }) {
  return (
    <button
      type="button"
      {...props}
      onPointerUp={(event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        onTap();
      }}
      onClick={(event) => {
        if (event.detail === 0) onTap();
      }}
    />
  );
}

type BottomNavProps = {
  /** Edit mode: Reset or Delete on the left, + in the centre opens the writing line, Save on the right leaves editing. */
  editing?: boolean;
  /** The edited portfolio is the first one: the left word reads Reset, else Delete. */
  resetsCard?: boolean;
  onRemove?: () => void;
  onEdit: () => void;
  onAdd?: () => void;
  onDone?: () => void;
  onNetwork?: () => void;
  onProfile?: () => void;
};

export const BottomNav = memo(function BottomNav({
  editing = false,
  resetsCard = false,
  onRemove,
  onEdit,
  onAdd,
  onDone,
  onNetwork,
  onProfile,
}: BottomNavProps) {
  // Edit fires on the finger lifting; the click after it lands on the + that takes its place.
  const editedAt = useRef(0);
  const editOrigin = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (editing) editedAt.current = Date.now();
  }, [editing]);

  const onEditPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    editOrigin.current = { x: event.clientX, y: event.clientY };
    window.getSelection()?.removeAllRanges();
  };

  const onEditPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const start = editOrigin.current;
    editOrigin.current = null;
    if (!start) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (dx * dx + dy * dy > REORDER_SLOP_PX * REORDER_SLOP_PX) return;
    onEdit();
  };

  return (
    <TabBand
      left={
        editing ? (
          <TapButton
            className="flex h-full min-h-11 w-full items-center uppercase"
            onTap={() => onRemove?.()}
          >
            {resetsCard ? "Reset" : "Delete"}
          </TapButton>
        ) : (
          <TapButton
            className="flex h-full min-h-11 w-full items-center uppercase"
            onTap={() => onProfile?.()}
          >
            Profile
          </TapButton>
        )
      }
      center={
        editing ? (
          <TapButton
            aria-label="Add"
            className="flex h-full min-h-11 w-full items-center justify-center"
            onTap={() => {
              if (Date.now() - editedAt.current < EDIT_CLICK_GUARD_MS) return;
              onAdd?.();
            }}
          >
            <MarkPlus className="text-[var(--ink)]" strokeWidth={1.5} />
          </TapButton>
        ) : (
          <button
            type="button"
            className="flex h-full min-h-11 w-full items-center justify-center uppercase"
            onPointerDown={onEditPointerDown}
            onPointerUp={onEditPointerUp}
            onPointerCancel={() => {
              editOrigin.current = null;
            }}
            onClick={(event) => {
              if (event.detail === 0) onEdit();
            }}
            onContextMenu={(event) => event.preventDefault()}
          >
            Edit
          </button>
        )
      }
      right={
        editing ? (
          <TapButton
            className="flex h-full min-h-11 w-full items-center justify-end uppercase"
            onTap={() => onDone?.()}
          >
            Save
          </TapButton>
        ) : (
          <TapButton
            className="flex h-full min-h-11 w-full items-center justify-end uppercase"
            onTap={() => onNetwork?.()}
          >
            Network
          </TapButton>
        )
      }
    />
  );
});
