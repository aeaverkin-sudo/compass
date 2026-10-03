"use client";

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
}: {
  title: string;
  fallbackHref: string;
  onBack?: () => void;
}) {
  const top = `calc(env(safe-area-inset-top) + ${SCREEN_TOP_AXIS_PX}px - ${HEADER_ROW_PX / 2}px)`;
  return (
    <>
      <BackButton fallbackHref={fallbackHref} onBack={onBack} />
      <h1
        className="pointer-events-none fixed z-20 flex items-center t-caps text-[var(--ink)]"
        style={{
          top,
          left: `calc(var(--gutter) + ${VALUE_AXIS_PX}px)`,
          height: HEADER_ROW_PX,
        }}
      >
        {title}
      </h1>
      <div aria-hidden className="mb-[18px]" style={{ height: `calc(${top} + ${HEADER_ROW_PX}px)` }} />
    </>
  );
}
