"use client";

import { HeroName } from "@/shared/components/hero-name";

const HINT_ONE = "NAME OR";
const HINT_TWO = "PORTFOLIO TITLE";

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
    <div
      data-entry-name=""
      className="relative flex h-full min-w-0 max-w-full flex-1 flex-col justify-end overflow-x-hidden"
      onFocusCapture={onTouch}
      onPointerDown={(event) => {
        const area = event.currentTarget.querySelector("textarea");
        if (!(area instanceof HTMLTextAreaElement)) return;
        if (event.target instanceof Node && area.contains(event.target)) return;
        area.focus();
      }}
    >
      <div className={hint ? "relative w-full min-w-0 max-w-full" : "absolute inset-0 min-w-0 overflow-x-hidden"}>
        {hint ? (
          <div aria-hidden className="pointer-events-none t-label" style={{ color: "var(--placeholder)" }}>
            <div className="whitespace-nowrap border-b-[0.5px] border-[var(--ink)] pb-[3px]">{HINT_ONE}</div>
            <div className="mt-[14px] whitespace-nowrap border-b-[0.5px] border-[var(--ink)] pb-[3px]">
              {HINT_TWO}
              <span className="relative -top-[0.35em] ml-[0.15em] leading-none text-[var(--ink)]">*</span>
            </div>
          </div>
        ) : null}
        <div className={hint ? "absolute inset-x-0 top-0 h-[15.95px]" : "flex h-full min-h-0 min-w-0 flex-col overflow-x-hidden"}>
          <HeroName value={shown} onChange={onChange} placeholder="" ruled />
        </div>
        {suggested ? (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 t-body text-[var(--placeholder)]">{value}</span>
        ) : null}
      </div>
    </div>
  );
}
