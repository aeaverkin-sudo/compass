"use client";

import type { ReactNode } from "react";
import { BackButton } from "@/shared/components/back-button";
import { HEADER_ROW_PX, VALUE_AXIS_PX } from "@/shared/layout/axes";
import { SCREEN_TOP_AXIS_PX } from "@main/layout";

/**
 * Section title on A1, back arrow on A0. The in-flow spacer keeps the same
 * gap Profile had: the row, then 18px, then a zone's own 18px padding.
 */
export function ScreenHeader({
  title,
  fallbackHref,
  onBack,
  spacer = true,
  trailing,
  center = false,
}: {
  title: string;
  fallbackHref: string;
  onBack?: () => void;
  /** Network keeps its search on the card line, so it does not reserve this gap. */
  spacer?: boolean;
  /** Sits on the header row, at the right gutter, mirroring the back arrow. */
  trailing?: ReactNode;
  /** Screen center. Other screens stay on the value axis. */
  center?: boolean;
}) {
  const top = `calc(env(safe-area-inset-top) + ${SCREEN_TOP_AXIS_PX}px - ${HEADER_ROW_PX / 2}px)`;
  return (
    <>
      <BackButton fallbackHref={fallbackHref} onBack={onBack} />
      <h1
        className={
          center
            ? "pointer-events-none fixed inset-x-0 z-20 flex items-center justify-center t-caps text-[var(--ink)]"
            : "pointer-events-none fixed z-20 flex items-center t-caps text-[var(--ink)]"
        }
        style={
          center
            ? { top, height: HEADER_ROW_PX }
            : { top, left: `calc(var(--gutter) + ${VALUE_AXIS_PX}px)`, height: HEADER_ROW_PX }
        }
      >
        {center ? <span className="-mr-[0.14em]">{title}</span> : title}
      </h1>
      {trailing ? (
        <div
          className="pointer-events-none fixed z-20 flex items-center"
          style={{ top, right: "var(--gutter)", height: HEADER_ROW_PX }}
        >
          {trailing}
        </div>
      ) : null}
      {spacer ? (
        <div aria-hidden className="mb-[18px] shrink-0" style={{ height: `calc(${top} + ${HEADER_ROW_PX}px)` }} />
      ) : null}
    </>
  );
}
