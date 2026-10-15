"use client";

import { useEffect, useRef } from "react";
import { MarkPlus } from "@/shared/components/mark-plus";
import { TabBand } from "./tab-band";

const EDIT_CLICK_GUARD_MS = 400;

type BottomNavProps = {
  /** Edit mode: Reset or Delete on the left, + in the centre opens the writing line, OK on the right leaves editing. */
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

export function BottomNav({
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
  useEffect(() => {
    if (editing) editedAt.current = Date.now();
  }, [editing]);

  return (
    <TabBand
      pin
      left={
        editing ? (
          <button
            type="button"
            className="flex h-full min-h-11 w-full items-center uppercase"
            onClick={() => onRemove?.()}
          >
            {resetsCard ? "Reset" : "Delete"}
          </button>
        ) : (
          <button
            type="button"
            className="flex h-full min-h-11 w-full items-center uppercase"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => onProfile?.()}
          >
            Profile
          </button>
        )
      }
      center={
        editing ? (
          <button
            type="button"
            aria-label="Add"
            className="flex h-full min-h-11 w-full items-center justify-center"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              if (Date.now() - editedAt.current < EDIT_CLICK_GUARD_MS) return;
              onAdd?.();
            }}
          >
            <MarkPlus className="text-[var(--ink)]" strokeWidth={1.5} />
          </button>
        ) : (
          <button
            type="button"
            className="flex h-full min-h-11 w-full items-center justify-center uppercase"
            onPointerDown={(event) => {
              event.preventDefault();
              window.getSelection()?.removeAllRanges();
            }}
            onPointerUp={(event) => {
              if (event.pointerType === "mouse" && event.button !== 0) return;
              onEdit();
            }}
            onContextMenu={(event) => event.preventDefault()}
          >
            Edit
          </button>
        )
      }
      right={
        editing ? (
          <button
            type="button"
            className="flex h-full min-h-11 w-full items-center justify-end"
            onClick={() => onDone?.()}
          >
            OK
          </button>
        ) : (
          <button
            type="button"
            className="flex h-full min-h-11 w-full items-center justify-end uppercase"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => onNetwork?.()}
          >
            Network
          </button>
        )
      }
    />
  );
}
