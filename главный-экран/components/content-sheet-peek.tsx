"use client";

import { cn } from "@/lib/utils";
import { SHEET_INSET, type MainScreenMode } from "../layout";

type ContentSheetPeekProps = {
  mode: MainScreenMode;
  edgeInsetPx: number;
  topBrowse: string;
  topLibrary: string;
  onTap: () => void;
};

function SkeletonRows({ count }: { count: number }) {
  const widths = ["92%", "88%", "72%", "94%", "80%", "65%"];
  return (
    <div className="flex flex-col gap-3">
      {widths.slice(0, count).map((width) => (
        <div
          key={width}
          className="mx-auto h-[14px] rounded-full bg-hairline/12"
          style={{ width }}
          aria-hidden
        />
      ))}
    </div>
  );
}

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
        "compass-sheet-peek compass-layer pointer-events-auto absolute inset-x-0 bottom-0 flex h-auto flex-col overflow-hidden rounded-t-[22px] text-left",
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
      <div className="mx-auto mt-3 mb-2 h-[4px] w-10 shrink-0 rounded-full bg-hairline/45" aria-hidden />

      <p className="shrink-0 px-4 pb-3 text-center text-[13px] leading-[1.25] text-hint">
        link, email, phone, file…
      </p>

      {/* Filling zone — the tall body marked green in mockups */}
      <div className="compass-sheet-body mx-3 mb-3 min-h-0 flex-1 rounded-[14px]" aria-hidden />

      <div className="shrink-0 px-4 pb-2">
        <SkeletonRows count={expanded ? 6 : 4} />
      </div>
    </button>
  );
}
