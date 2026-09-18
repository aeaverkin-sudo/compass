"use client";

import { cn } from "@/lib/utils";
import type { MainScreenMode } from "../layout";

type ContentSheetPeekProps = {
  mode: MainScreenMode;
  edgeInsetPx: number;
  sheetTopLibrary?: number;
  onTap: () => void;
};

export function ContentSheetPeek({ mode, edgeInsetPx, sheetTopLibrary, onTap }: ContentSheetPeekProps) {
  const expanded = mode === "library";

  return (
    <button
      type="button"
      aria-label={expanded ? "Свернуть поле наполнения" : "Открыть поле наполнения визитки"}
      aria-expanded={expanded}
      onClick={onTap}
      className={cn(
        "compass-sheet-peek compass-layer absolute flex min-h-0 flex-col overflow-hidden rounded-t-[22px] text-left",
        "transition-[top,height,box-shadow] duration-[460ms] ease-out active:scale-[0.998]",
        expanded ? "compass-sheet-expanded" : "compass-sheet-collapsed",
      )}
      style={{
        left: edgeInsetPx,
        right: edgeInsetPx,
        ...(expanded && sheetTopLibrary !== undefined ? { top: sheetTopLibrary, bottom: 0, height: "auto" } : {}),
      }}
    >
      <div className="mx-auto mt-3 mb-4 h-[4px] w-10 shrink-0 rounded-full bg-hairline/40" aria-hidden />

      <div className="min-h-0 flex-1 overflow-hidden px-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="mb-4 text-center text-[13px] leading-[1.25] text-hint">
          link, email, phone, file…
        </p>

        <div className="flex flex-col gap-3">
          <div className="h-[14px] rounded-full bg-hairline/12" aria-hidden />
          <div className="mx-auto h-[14px] w-[88%] rounded-full bg-hairline/12" aria-hidden />
          <div className="mx-auto h-[14px] w-[72%] rounded-full bg-hairline/12" aria-hidden />
          <div className="mx-auto h-[14px] w-[94%] rounded-full bg-hairline/10" aria-hidden />
          {expanded ? (
            <>
              <div className="mx-auto h-[14px] w-[80%] rounded-full bg-hairline/10" aria-hidden />
              <div className="mx-auto h-[14px] w-[65%] rounded-full bg-hairline/8" aria-hidden />
            </>
          ) : null}
        </div>
      </div>
    </button>
  );
}
