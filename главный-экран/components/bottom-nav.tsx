"use client";

import { MarkPlus } from "@/shared/components/mark-plus";
import { TabBand } from "./tab-band";

type BottomNavProps = {
  /** Edit mode: + on the left opens the writing line, OK on the right leaves editing. */
  editing?: boolean;
  onEdit: () => void;
  onAdd?: () => void;
  onDone?: () => void;
  onNetwork?: () => void;
  onProfile?: () => void;
};

export function BottomNav({
  editing = false,
  onEdit,
  onAdd,
  onDone,
  onNetwork,
  onProfile,
}: BottomNavProps) {
  return (
    <TabBand
      pin
      left={
        editing ? (
          <button
            type="button"
            aria-label="Add"
            className="flex h-full min-h-11 w-full items-center"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => onAdd?.()}
          >
            <MarkPlus className="text-[var(--ink)]" strokeWidth={1.5} />
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
          <span className="h-full min-h-11 w-full" />
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
