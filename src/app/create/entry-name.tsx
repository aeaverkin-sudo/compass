"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { HeroName } from "@/shared/components/hero-name";

const HINT_ONE = "NAME OR";
const HINT_TWO = "PORTFOLIO TITLE";
const HINT_MAX_PX = 19;
const HINT_MIN_PX = 8;

function textWidth(sample: HTMLElement, text: string, size: number) {
  const font = getComputedStyle(sample);
  const probe = document.createElement("span");
  probe.textContent = text;
  probe.style.cssText = `position:absolute;left:-9999px;white-space:nowrap;font-family:${font.fontFamily};font-weight:${font.fontWeight};font-size:${size}px;line-height:1;letter-spacing:${font.letterSpacing}`;
  document.body.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width;
}

/** Largest size at which both nowrap lines sit inside the column. The star sits 0.15em after the title. */
function fitHint(width: number, sample: HTMLElement) {
  if (!width) return HINT_MIN_PX;
  const limit = width - 1;
  let lo = HINT_MIN_PX;
  let hi = HINT_MAX_PX;
  const fits = (size: number) =>
    textWidth(sample, HINT_ONE, size) <= limit &&
    textWidth(sample, HINT_TWO, size) + textWidth(sample, "*", size) + size * 0.15 <= limit;
  for (let step = 0; step < 12; step += 1) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
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
  const hintRef = useRef<HTMLSpanElement>(null);
  const [hintSize, setHintSize] = useState(HINT_MAX_PX);
  const shown = live ? value : "";
  const suggested = Boolean(value.trim() && !live);
  const hint = shown.length === 0 && !suggested;

  useLayoutEffect(() => {
    const column = columnRef.current;
    const sample = hintRef.current;
    if (!column || !sample || !hint) return;
    const fit = () => {
      const next = fitHint(column.clientWidth, sample);
      setHintSize((current) => (Math.abs(current - next) < 0.05 ? current : next));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(column);
    let cancel = false;
    void document.fonts?.ready.then(() => {
      if (!cancel) fit();
    });
    return () => {
      cancel = true;
      observer.disconnect();
    };
  }, [hint]);

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
          ref={hintRef}
          className="pointer-events-none absolute inset-x-0 bottom-0 font-normal leading-none text-[var(--placeholder)]"
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
