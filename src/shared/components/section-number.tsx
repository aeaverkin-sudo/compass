"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { capTop, capTopEstimate } from "@/shared/lib/cap-top";

/** The Data figure and the card section number share this. */
export const NUMBER_CLASS =
  "text-[32px] leading-none font-normal tracking-[-0.03em] text-[var(--ink)] tabular-nums";

const NUMBER_ESTIMATE = capTopEstimate(32, 32);

function useMeasuredCap(sample: () => Element | null | undefined) {
  const [lift, setLift] = useState<number | null>(null);
  useLayoutEffect(() => {
    let cancel = false;
    const apply = () => {
      if (cancel) return;
      const el = sample();
      if (!el) return;
      const next = capTop(el);
      setLift((current) => (current === next ? current : next));
    };
    apply();
    void document.fonts?.ready.then(apply);
    return () => {
      cancel = true;
    };
  });
  return lift;
}

/** 01, 02… Hidden until the font metric is measured, so the digit does not jump. */
export function SectionNumber({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const lift = useMeasuredCap(() => ref.current);
  return (
    <span
      ref={ref}
      data-section-number=""
      className={cn(NUMBER_CLASS, "block")}
      style={{ marginTop: -(lift ?? NUMBER_ESTIMATE), opacity: lift == null ? 0 : 1 }}
    >
      {value}
    </span>
  );
}

/** First line of the value column. Its cap lines up with the section number. */
export function ValueCap({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const lift = useMeasuredCap(() => ref.current?.querySelector(".t-body"));
  const fallback = capTopEstimate(15.5, 15.5 * 1.45);
  return (
    <div ref={ref} className={className} style={{ marginTop: -(lift ?? fallback) }}>
      {children}
    </div>
  );
}

export function sectionNumberLabel(index: number) {
  return String(index + 1).padStart(2, "0");
}
