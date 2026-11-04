"use client";

import { HeroName } from "@/shared/components/hero-name";
import { RequiredStar } from "./entry-zones";

const HINT_ONE = "Name or";
const HINT_TWO = "portfolio title";
/** One `t-body` line. The caret sits on the first hint line. */
const HINT_LINE_PX = 15.5 * 1.45;

export function EntryName({
  value,
  live,
  onChange,
  onTouch,
}: {
  value: string;
  /** A suggested name stays grey until the caret is placed. */
  live: boolean;
  onChange: (value: string) => void;
  onTouch: () => void;
}) {
  const shown = live ? value : "";
  const suggested = Boolean(value.trim() && !live);
  const hint = shown.length === 0 && !suggested;

  return (
    <label
      data-entry-name=""
      className="relative flex h-full min-w-0 max-w-full flex-1 flex-col justify-end overflow-x-hidden"
      onFocusCapture={onTouch}
    >
      <div className={hint ? "relative w-full min-w-0 max-w-full" : "absolute inset-0 min-w-0 overflow-x-hidden"}>
        {hint ? (
          <div aria-hidden className="pointer-events-none t-body text-[var(--placeholder)]">
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
          <HeroName value={shown} onChange={onChange} placeholder="" ruled />
        </div>
        {suggested ? (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 t-body text-[var(--placeholder)]">{value}</span>
        ) : null}
      </div>
    </label>
  );
}
