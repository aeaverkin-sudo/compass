"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { SectionNumber, ValueCap, sectionNumberLabel } from "@/shared/components/section-number";
import { baselineOffset } from "@/shared/lib/cap-top";

/** Grey caps entry into a room. Same look for every room, no arrows. */
export const ENTRY =
  "press inline-block t-caps text-[var(--grey)] no-underline [-webkit-tap-highlight-color:transparent]";

const ENTRY_GAP_PX = 8;

/** Alphabetic baseline of the first line, in viewport coordinates. */
function firstBaseline(el: Element) {
  const line = el.getClientRects()[0] ?? el.getBoundingClientRect();
  return line.top + baselineOffset(el);
}

export function Room({
  index,
  label,
  entry,
  href,
  children,
}: {
  index: number;
  label: string;
  entry: string;
  href: string;
  children?: ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const valueRef = useRef<HTMLDivElement>(null);
  const entryRef = useRef<HTMLAnchorElement>(null);
  const [gap, setGap] = useState(0);

  useLayoutEffect(() => {
    const measure = () => {
      const labelEl = labelRef.current;
      const valueEl = valueRef.current;
      const entryEl = entryRef.current;
      if (!labelEl || !valueEl || !entryEl) return;
      const entryBox = entryEl.getBoundingClientRect();
      const currentGap = Number.parseFloat(getComputedStyle(entryEl).marginTop) || 0;
      const restingTop = entryBox.top - currentGap;
      const entryInset = firstBaseline(entryEl) - entryBox.top;
      const onLabel = firstBaseline(labelEl) - entryInset;
      const belowValue = valueEl.getBoundingClientRect().bottom + ENTRY_GAP_PX;
      const next = Math.round((Math.max(onLabel, belowValue) - restingTop) * 10) / 10;
      if (!Number.isFinite(next)) return;
      setGap((current) => (Math.abs(current - next) < 0.5 ? current : next));
    };

    measure();
    const row = rowRef.current;
    const number = row?.querySelector("[data-section-number]");
    const mutations = new MutationObserver(measure);
    if (number) mutations.observe(number, { attributes: true, attributeFilter: ["style"] });
    const sizes = new ResizeObserver(measure);
    if (valueRef.current) sizes.observe(valueRef.current);
    if (row) sizes.observe(row);
    window.addEventListener("resize", measure);
    void document.fonts?.ready.then(measure);
    return () => {
      mutations.disconnect();
      sizes.disconnect();
      window.removeEventListener("resize", measure);
    };
  });

  return (
    <section className="min-w-0 border-b border-[var(--rule)] py-[18px]">
      <div ref={rowRef} className="grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px]">
        <div className="min-w-0">
          <SectionNumber value={sectionNumberLabel(index)} />
          <span ref={labelRef} className="t-label mt-[6px] block">{label}</span>
        </div>
        <div className="flex min-w-0 flex-col items-start">
          <ValueCap className="w-full min-w-0">
            <div ref={valueRef} className="t-body text-[var(--ink)]">
              {children}
            </div>
          </ValueCap>
          <Link ref={entryRef} href={href} className={ENTRY} style={{ marginTop: gap }}>
            {entry}
          </Link>
        </div>
      </div>
    </section>
  );
}
