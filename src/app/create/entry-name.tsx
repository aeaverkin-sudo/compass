"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { HeroName } from "@/shared/components/hero-name";

const HINT_ONE = "NAME, COMPANY,";
const HINT_TWO = "PORTFOLIO TITLE";
const HINT_MAX_PX = 19;
const HINT_MIN_PX = 8;

function textWidth(text: string, size: number) {
  const probe = document.createElement("span");
  probe.textContent = text;
  probe.style.cssText = `position:absolute;left:-9999px;white-space:nowrap;font-family:${getComputedStyle(document.body).fontFamily};font-weight:400;font-size:${size}px;line-height:1`;
  document.body.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width;
}

/** One size for both hint lines, so neither wraps. */
function fitHint(width: number) {
  if (!width) return HINT_MIN_PX;
  let lo = HINT_MIN_PX;
  let hi = HINT_MAX_PX;
  for (let step = 0; step < 12; step += 1) {
    const mid = (lo + hi) / 2;
    const fits = textWidth(HINT_ONE, mid) <= width && textWidth(`${HINT_TWO} *`, mid) <= width;
    if (fits) lo = mid;
    else hi = mid;
  }
  return lo;
}

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
  const columnRef = useRef<HTMLDivElement>(null);
  const [hintSize, setHintSize] = useState(HINT_MAX_PX);
  const shown = live ? value : "";
  const suggested = Boolean(value.trim() && !live);

  useLayoutEffect(() => {
    const column = columnRef.current;
    if (!column || suggested) return;
    const fit = () => setHintSize(fitHint(column.clientWidth));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(column);
    return () => observer.disconnect();
  }, [suggested]);

  return (
    <div
      ref={columnRef}
      data-entry-name=""
      className="relative flex h-full min-w-0 flex-1 flex-col border-b border-[var(--rule)]"
      onFocusCapture={onTouch}
      onPointerDown={(event) => {
        const area = event.currentTarget.querySelector("textarea");
        if (!(area instanceof HTMLTextAreaElement)) return;
        if (event.target instanceof Node && area.contains(event.target)) return;
        event.preventDefault();
        area.focus();
      }}
    >
      <HeroName value={shown} onChange={onChange} placeholder="" />
      {shown.length === 0 ? (
        <span
          className="pointer-events-none absolute bottom-0 left-0 font-normal leading-none text-[var(--placeholder)]"
          style={{ fontSize: hintSize }}
        >
          {suggested ? (
            value
          ) : (
            <>
              <span className="block whitespace-nowrap">{HINT_ONE}</span>
              <span className="block whitespace-nowrap">
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
