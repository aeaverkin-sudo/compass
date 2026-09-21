"use client";

import { MoreHorizontal } from "lucide-react";
import { layoutTop, QR_COLOR, type MainScreenMode } from "../layout";

type BrowseMenuButtonProps = {
  centerYpx: number;
  mode: MainScreenMode;
  onTap: () => void;
};

export function BrowseMenuButton({ centerYpx, mode, onTap }: BrowseMenuButtonProps) {
  const expanded = mode === "library";

  return (
    <button
      type="button"
      aria-label={expanded ? "Close content menu" : "Open content menu"}
      aria-expanded={expanded}
      onClick={onTap}
      className="pointer-events-auto absolute left-1/2 z-30 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center transition-opacity active:opacity-60"
      style={{ top: layoutTop(centerYpx) }}
    >
      <MoreHorizontal className="size-7" strokeWidth={2.25} style={{ color: QR_COLOR }} aria-hidden />
    </button>
  );
}
