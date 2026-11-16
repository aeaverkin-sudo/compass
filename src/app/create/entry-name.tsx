"use client";

import { cn } from "@/lib/utils";
import { HeroName } from "@/shared/components/hero-name";
import { RequiredStar } from "./entry-zones";

const HINT_ONE = "Name or";
const HINT_TWO = "portfolio title";
/** One `t-body` line. The caret sits on the first hint line. */
const HINT_LINE_PX = 15.5 * 1.45;

export function EntryName({
  value,
  live,
  marked = false,
  onChange,
  onTouch,
}: {
  value: string;
  /** A suggested name is full size and grey until a row is touched. */
  live: boolean;
  /** Empty required name, after Create was tapped. The questionnaire does not pass this. */
  marked?: boolean;
  onChange: (value: string) => void;
  onTouch: () => void;
}) {
  const suggested = Boolean(value.trim() && !live);
  const shown = value;
  const hint = shown.length === 0;

  return (
    <label
      data-entry-name=""
      className="relative flex h-full min-w-0 max-w-full flex-1 flex-col justify-end overflow-x-hidden"
      onFocusCapture={onTouch}
    >
      <div className={hint ? "relative w-full min-w-0 max-w-full" : "absolute inset-0 min-w-0 overflow-x-hidden"}>
        {hint ? (
          <div aria-hidden className={cn("pointer-events-none t-body", marked ? "text-[#E23B2F]" : "text-[var(--placeholder)]")}>
            <div className="whitespace-nowrap border-b border-[var(--rule)] pb-[3px]">{HINT_ONE}</div>
            <div className="mt-[14px] whitespace-nowrap border-b border-[var(--rule)] pb-[3px]">
              {HINT_TWO}
              <RequiredStar />
            </div>
          </div>
        ) : null}
        <div
          className={hint ? "absolute inset-x-0 top-0" : "flex h-full min-h-0 min-w-0 flex-col overflow-x-hidden"}
          style={hint ? { height: HINT_LINE_PX } : undefined}
        >
          <HeroName value={shown} onChange={onChange} placeholder="" ruled tone={suggested ? "placeholder" : "ink"} />
        </div>
      </div>
    </label>
  );
}
