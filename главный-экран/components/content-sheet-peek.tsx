"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

type ContentSheetPeekProps = {
  expanded: boolean;
  onTap: () => void;
  style?: CSSProperties;
};

export function ContentSheetPeek({ expanded, onTap, style }: ContentSheetPeekProps) {
  return (
    <button
      type="button"
      aria-label="Открыть поле наполнения визитки"
      aria-expanded={expanded}
      onClick={onTap}
      className={cn(
        "compass-sheet-peek absolute bottom-0 z-10 flex min-h-0 flex-col overflow-hidden rounded-t-[22px] text-left transition-transform duration-300 ease-out active:scale-[0.995]",
        expanded && "-translate-y-[8lvh]",
      )}
      style={style}
    >
      <div className="mx-auto mt-3 mb-4 h-[4px] w-10 shrink-0 rounded-full bg-hairline/40" aria-hidden />

      <div className="min-h-0 flex-1 overflow-hidden px-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="mb-4 text-center text-[13px] leading-[1.25] text-hint">
          link, email, phone, file…
        </p>

        <div className="flex flex-col gap-3">
          <div className="h-[14px] rounded-full bg-hairline/12" aria-hidden />
          <div className="h-[14px] w-[88%] rounded-full bg-hairline/12" aria-hidden />
          <div className="h-[14px] w-[72%] rounded-full bg-hairline/12" aria-hidden />
          <div className="h-[14px] w-[94%] rounded-full bg-hairline/10" aria-hidden />
        </div>
      </div>
    </button>
  );
}
