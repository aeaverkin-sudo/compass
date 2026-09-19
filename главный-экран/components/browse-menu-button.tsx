"use client";

import { MoreHorizontal } from "lucide-react";
import { layoutTop, QR_COLOR } from "../layout";

type BrowseMenuButtonProps = {
  centerYpx: number;
  onTap: () => void;
};

export function BrowseMenuButton({ centerYpx, onTap }: BrowseMenuButtonProps) {
  return (
    <button
      type="button"
      aria-label="Меню наполнения визитки"
      onClick={onTap}
      className="pointer-events-auto absolute left-1/2 z-30 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center transition-opacity active:opacity-60"
      style={{ top: layoutTop(centerYpx) }}
    >
      <MoreHorizontal className="size-7" strokeWidth={2.25} style={{ color: QR_COLOR }} aria-hidden />
    </button>
  );
}
