"use client";

import { cn } from "@/lib/utils";
import { SHEET_INSET, type MainScreenMode } from "../layout";

type ContentSheetPeekProps = {
  mode: MainScreenMode;
  edgeInsetPx: number;
  topBrowse: number;
  topLibrary: number;
  onTap: () => void;
};

export function ContentSheetPeek({
  mode,
  edgeInsetPx,
  topBrowse,
  topLibrary,
  onTap,
}: ContentSheetPeekProps) {
  const expanded = mode === "library";
  const top = expanded ? topLibrary : topBrowse;
  const bottomInset = expanded ? SHEET_INSET.library.bottom : SHEET_INSET.browse.bottom;

  return (
    <button
      type="button"
      aria-label={expanded ? "Свернуть поле наполнения" : "Открыть поле наполнения визитки"}
      aria-expanded={expanded}
      onClick={onTap}
      className={cn(
        "compass-sheet-peek compass-layer pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-[22px] text-left",
        "transition-[top,box-shadow] duration-[460ms] ease-out active:scale-[0.998]",
        expanded && "compass-sheet-expanded",
      )}
      style={{
        left: edgeInsetPx,
        right: edgeInsetPx,
        top,
        paddingBottom: `max(${bottomInset}px, env(safe-area-inset-bottom))`,
      }}
    >
      <div className="mx-auto mt-3 mb-3 h-[4px] w-10 shrink-0 rounded-full bg-hairline/45" aria-hidden />

      <div className="min-h-[120px] flex-1 overflow-hidden px-2">
        <p className="mb-5 text-center text-[13px] leading-[1.25] text-hint">
          link, email, phone, file…
        </p>

        <div className="flex flex-col gap-3.5">
          <div className="mx-auto h-[14px] w-full max-w-[92%] rounded-full bg-hairline/14" aria-hidden />
          <div className="mx-auto h-[14px] w-[88%] rounded-full bg-hairline/14" aria-hidden />
          <div className="mx-auto h-[14px] w-[72%] rounded-full bg-hairline/12" aria-hidden />
          <div className="mx-auto h-[14px] w-[94%] rounded-full bg-hairline/10" aria-hidden />
          {expanded ? (
            <>
              <div className="mx-auto h-[14px] w-[80%] rounded-full bg-hairline/10" aria-hidden />
              <div className="mx-auto h-[14px] w-[65%] rounded-full bg-hairline/8" aria-hidden />
              <div className="mx-auto h-[14px] w-[76%] rounded-full bg-hairline/8" aria-hidden />
            </>
          ) : (
            <>
              <div className="mx-auto h-[14px] w-[68%] rounded-full bg-hairline/10" aria-hidden />
              <div className="mx-auto h-[14px] w-[84%] rounded-full bg-hairline/8" aria-hidden />
            </>
          )}
        </div>
      </div>
    </button>
  );
}
