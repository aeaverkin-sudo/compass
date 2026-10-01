"use client";

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
            className="inline-flex items-baseline py-2 text-[22.15px] leading-none font-light tracking-normal"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => onAdd?.()}
          >
            +
          </button>
        ) : (
          <button
            type="button"
            className="py-2 uppercase"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => onProfile?.()}
          >
            Profile
          </button>
        )
      }
      center={
        editing ? undefined : (
          <button
            type="button"
            className="px-2 py-2 uppercase"
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
            className="py-2 text-[14px] leading-[1.45] font-normal tracking-[0.1em] uppercase"
            onClick={() => onDone?.()}
          >
            OK
          </button>
        ) : (
          <button
            type="button"
            className="py-2 uppercase"
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
