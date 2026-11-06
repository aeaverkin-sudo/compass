"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { BAND_DROP_PX, BAND_ROW_PX } from "../layout";

/** The word itself, not the cell. Letter-spacing's tail is inside this box. */
function labelNode(slot: HTMLElement | null): HTMLElement | null {
  if (!slot) return null;
  const control = slot.querySelector("button, a");
  if (!(control instanceof HTMLElement)) return slot.firstElementChild instanceof HTMLElement ? slot.firstElementChild : slot;
  const span = control.querySelector("span");
  return span instanceof HTMLElement ? span : control;
}

const WORD = "[&>*]:!w-max [&_a]:!w-max [&_button]:!w-max [&_a]:-mr-[0.14em] [&_button]:-mr-[0.14em]";

/**
 * The sky bar. Last child of the page column, one row, one height.
 * Padding under the row is the home indicator minus the 29px the old plate did not carry.
 * Three words: the middle sits half a step toward the wider side, so a long left word
 * does not make it look stuck to the left. A two-word bar stays an even split.
 */
export function TabBand({
  left,
  right,
  center,
  label,
  inset = "var(--gutter)",
}: {
  left: ReactNode;
  right: ReactNode;
  center?: ReactNode;
  label?: string;
  /** Horizontal pad. The portfolio and Network use the column gutter. */
  inset?: string;
}) {
  const centered = center != null;
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const [nudge, setNudge] = useState(0);

  useLayoutEffect(() => {
    if (!centered) return;
    const leftSlot = leftRef.current;
    const rightSlot = rightRef.current;
    if (!leftSlot || !rightSlot) return;
    const measure = () => {
      const leftWord = labelNode(leftSlot);
      const rightWord = labelNode(rightSlot);
      if (!leftWord || !rightWord) return;
      const next = Math.round((leftWord.getBoundingClientRect().width - rightWord.getBoundingClientRect().width) / 4);
      setNudge((current) => (current === next ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(leftSlot);
    observer.observe(rightSlot);
    return () => observer.disconnect();
  }, [centered]);

  return (
    <nav
      aria-label={label}
      className="compass-sky-band pointer-events-auto relative z-30 w-full shrink-0 bg-sky t-band text-[var(--ink)] select-none [-webkit-touch-callout:none]"
      style={{
        paddingBottom: `max(0px, calc(env(safe-area-inset-bottom) - ${BAND_DROP_PX}px))`,
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      {centered ? (
        <div
          className="grid items-stretch"
          style={{
            height: BAND_ROW_PX,
            paddingLeft: inset,
            paddingRight: inset,
            gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
          }}
        >
          <div ref={leftRef} className={`flex min-h-11 w-max items-stretch justify-self-start ${WORD}`}>
            {left}
          </div>
          <div
            className={`flex min-h-11 w-max items-stretch justify-self-center ${WORD}`}
            style={nudge === 0 ? undefined : { transform: `translateX(${nudge}px)` }}
          >
            {center}
          </div>
          <div ref={rightRef} className={`flex min-h-11 w-max items-stretch justify-self-end ${WORD}`}>
            {right}
          </div>
        </div>
      ) : (
        <div
          className="flex items-stretch"
          style={{ height: BAND_ROW_PX, paddingLeft: inset, paddingRight: inset }}
        >
          <div className="flex min-h-11 min-w-0 flex-1 items-stretch">{left}</div>
          <div className="flex min-h-11 min-w-0 flex-1 items-stretch justify-end">{right}</div>
        </div>
      )}
    </nav>
  );
}
