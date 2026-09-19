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
      aria-label={expanded ? "Collapse content sheet" : "Open content sheet"}
      aria-expanded={expanded}
      onClick={onTap}
      className={cn(
        "compass-sheet-peek compass-layer pointer-events-auto absolute inset-x-0 bottom-0 flex h-auto flex-col overflow-hidden text-left",
        !expanded && "rounded-t-[22px]",
        "transition-[top,box-shadow] duration-[460ms] ease-out active:scale-[0.998]",
        expanded && "compass-sheet-expanded compass-sheet-library",
        !expanded && "compass-sheet-under-card",
      )}
      style={{
        left: edgeInsetPx,
        right: edgeInsetPx,
        top,
        paddingBottom: `max(${bottomInset}px, env(safe-area-inset-bottom))`,
      }}
    >
      {!expanded ? (
        <div className="flex min-h-0 flex-1 flex-col px-4 pt-3 pb-2">
          <SkeletonRows count={3} />
        </div>
      ) : null}
    </button>
  );
}
