"use client";

import { Plus } from "lucide-react";
import { layoutTop } from "../layout";

type BottomNavProps = {
  centerYpx: number;
  /** Distance from each screen edge to the card, so the labels sit on the card's column. */
  insetPx: number;
  /** Edit mode: + on the left opens the writing line, OK on the right leaves editing. */
  editing?: boolean;
  onEdit: () => void;
  onAdd?: () => void;
  onDone?: () => void;
};

export function BottomNav({ centerYpx, insetPx, editing = false, onEdit, onAdd, onDone }: BottomNavProps) {
  return (
    <nav
      className="pointer-events-auto absolute z-30 grid -translate-y-1/2 grid-cols-3 items-center px-[calc(clamp(24px,6.1vw,28px)-3mm)] text-[17px] leading-none font-light tracking-[-0.01em] text-[#111] select-none [-webkit-touch-callout:none]"
      style={{
        top: layoutTop(centerYpx),
        left: insetPx,
        right: insetPx,
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      {editing ? (
        <button
          type="button"
          aria-label="Add"
          className="justify-self-start py-2"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => onAdd?.()}
        >
          <Plus className="size-[17px] text-[#111]" strokeWidth={1} aria-hidden />
        </button>
      ) : (
        <span aria-current="page" className="justify-self-start py-2">
          Profile
        </span>
      )}
      {editing ? (
        <span />
      ) : (
        <button
          type="button"
          className="justify-self-center px-2 py-2"
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
      )}
      {editing ? (
        <button type="button" className="justify-self-end px-2 py-2" onClick={() => onDone?.()}>
          OK
        </button>
      ) : (
        <span className="justify-self-end py-2">Network</span>
      )}
    </nav>
  );
}
