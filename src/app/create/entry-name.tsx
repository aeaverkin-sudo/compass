"use client";

import { HeroName } from "@/shared/components/hero-name";

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
  return (
    <div
      data-entry-name=""
      className="relative flex h-full min-w-0 flex-1 flex-col border-b border-[var(--rule)]"
      onFocusCapture={onTouch}
    >
      <HeroName value={shown} onChange={onChange} placeholder="" />
      {shown.length === 0 ? (
        <span className="pointer-events-none absolute bottom-0 left-0 text-[19px] font-normal leading-none text-[var(--placeholder)]">
          {value.trim() && !live ? (
            value
          ) : (
            <>
              NAME, COMPANY,
              <br />
              PORTFOLIO TITLE
              <span className="relative -top-[0.35em] ml-[0.15em] leading-none">*</span>
            </>
          )}
        </span>
      ) : null}
    </div>
  );
}
