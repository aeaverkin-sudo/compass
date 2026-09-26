"use client";

import { layoutTop } from "../layout";

type BrowseMenuButtonProps = {
  centerYpx: number;
  onTap: () => void;
};

export function BrowseMenuButton({ centerYpx, onTap }: BrowseMenuButtonProps) {
  return (
    <button
      type="button"
      aria-label="Edit"
      className="pointer-events-auto absolute left-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 px-2 py-2 select-none [-webkit-touch-callout:none]"
      style={{ top: layoutTop(centerYpx), WebkitUserSelect: "none", userSelect: "none" }}
      onPointerDown={(event) => {
        event.preventDefault();
        window.getSelection()?.removeAllRanges();
      }}
      onPointerUp={(event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        onTap();
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {[0, 1].map((index) => (
        <span key={index} aria-hidden className="size-[9.2px] rounded-full bg-[#111]" />
      ))}
    </button>
  );
}
