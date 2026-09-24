"use client";

import { cn } from "@/lib/utils";
import { layoutTop, type MainScreenMode } from "../layout";

type BrowseMenuButtonProps = {
  centerYpx: number;
  mode: MainScreenMode;
  onTap: () => void;
};

export function BrowseMenuButton({ centerYpx, mode, onTap }: BrowseMenuButtonProps) {
  const expanded = mode === "library";
  const activeIndex = expanded ? 1 : 0;

  return (
    <button
      type="button"
      aria-label={expanded ? "Close content menu" : "Open content menu"}
      aria-expanded={expanded}
      onClick={onTap}
      className="pointer-events-auto absolute left-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 px-2 py-2 transition-opacity active:opacity-60"
      style={{ top: layoutTop(centerYpx) }}
    >
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          aria-hidden
          className={cn(
            "size-2 rounded-full border bg-transparent",
            index === activeIndex ? "border-[#111]" : "border-[#D8D2C4]",
          )}
        />
      ))}
    </button>
  );
}
