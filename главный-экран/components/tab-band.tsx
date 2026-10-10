"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useMainLayout } from "../hooks/use-main-layout";
import { browseBandHeightCss } from "../layout";

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

/**
 * The sky plaque under the card. Profile and Network on the card, Event and Data
 * on the contact list: one height, one type, one gutter, one lift above the toolbar.
 */
export function TabBand({
  left,
  right,
  center,
  pin = false,
  safeBottom = false,
  label,
}: {
  left: ReactNode;
  right: ReactNode;
  center?: ReactNode;
  /** Fixed to the screen bottom, over the card. The list uses the in-flow bar. */
  pin?: boolean;
  /** Public card: blue runs `--band-h` plus `--band-safe`. Labels sit in the middle of that blue. */
  safeBottom?: boolean;
  label?: string;
}) {
  useMainLayout();
  const band = `var(--band-h, ${browseBandHeightCss()})`;
  const lift = "var(--band-safe, 0px)";
  return (
    <nav
      aria-label={label}
      className={cn(
        "compass-sky-band shrink-0 bg-sky t-caps text-[var(--ink)] select-none [-webkit-touch-callout:none]",
        pin && "pointer-events-auto absolute inset-x-0 z-30",
      )}
      style={{
        height: safeBottom ? `calc(${band} + ${lift})` : band,
        paddingBottom: safeBottom ? `calc(${lift} / 2)` : undefined,
        bottom: pin ? "var(--vv-bottom, 0px)" : undefined,
        fontFamily: FONT,
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      <div className="flex h-full items-stretch px-[var(--gutter)]">
        <div className="flex min-h-11 min-w-0 flex-1 items-stretch">{left}</div>
        {center != null ? <div className="flex min-h-11 min-w-0 flex-1 items-stretch">{center}</div> : null}
        <div className="flex min-h-11 min-w-0 flex-1 items-stretch">{right}</div>
      </div>
    </nav>
  );
}
