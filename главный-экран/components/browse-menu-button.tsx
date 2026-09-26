"use client";

import { useLongPress } from "@/shared/hooks/use-long-press";
import { layoutTop } from "../layout";

const HOLD_MS = 200;

type BrowseMenuButtonProps = {
  centerYpx: number;
  onHold: () => void;
};

export function BrowseMenuButton({ centerYpx, onHold }: BrowseMenuButtonProps) {
  const hold = useLongPress(onHold, HOLD_MS);

  return (
    <button
      type="button"
      aria-label="Hold to edit"
      className="pointer-events-auto absolute left-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 items-center gap-[3px] px-2 py-2 select-none [-webkit-touch-callout:none]"
      style={{ top: layoutTop(centerYpx), WebkitUserSelect: "none", userSelect: "none" }}
      onPointerDown={(event) => {
        event.preventDefault();
        window.getSelection()?.removeAllRanges();
        hold.onPointerDown(event);
      }}
      onPointerMove={hold.onPointerMove}
      onPointerUp={hold.onPointerUp}
      onPointerCancel={hold.onPointerCancel}
      onPointerLeave={hold.onPointerLeave}
      onClick={hold.onClick}
      onContextMenu={hold.onContextMenu}
    >
      {[0, 1].map((index) => (
        <span
          key={index}
          aria-hidden
          className="size-[7px] rounded-full border border-[#111] bg-transparent"
        />
      ))}
    </button>
  );
}
