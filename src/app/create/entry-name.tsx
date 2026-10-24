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

  return (
    <div
      data-entry-name=""
      className="relative flex h-full min-w-0 flex-1 flex-col"
      onFocusCapture={onTouch}
      onPointerDown={(event) => {
        const area = event.currentTarget.querySelector("textarea");
        if (!(area instanceof HTMLTextAreaElement)) return;
        if (event.target instanceof Node && area.contains(event.target)) return;
        event.preventDefault();
        area.focus();
      }}
    >
      <HeroName value={shown} onChange={onChange} placeholder="" ruled />
      {shown.length === 0 ? (
        <span
          className={
            suggested
              ? "pointer-events-none absolute inset-x-0 bottom-0 t-body text-[var(--placeholder)]"
              : "pointer-events-none absolute inset-x-0 bottom-0 t-label"
          }
          style={suggested ? undefined : { color: "var(--placeholder)" }}
        >
          {suggested ? (
            value
          ) : (
            <>
              <span className="block whitespace-nowrap border-b-[0.5px] border-[var(--ink)] pb-[3px]">{HINT_ONE}</span>
              <span className="mt-[14px] block whitespace-nowrap border-b-[0.5px] border-[var(--ink)] pb-[3px]">
                {HINT_TWO}
                <span className="relative -top-[0.35em] ml-[0.15em] leading-none text-[var(--ink)]">*</span>
              </span>
            </>
          )}
        </span>
      ) : null}
    </div>
  );
}
