"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useMainLayout } from "../hooks/use-main-layout";
import { browseBandHeightCss } from "../layout";

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

/**
 * The sky plaque under the card. Profile and Network on the card, Event and Data
 * on the contact list: one height, one type, one px-8, one lift above the toolbar.
 */
export function TabBand({
  left,
  right,
  center,
  pin = false,
  label,
}: {
  left: ReactNode;
  right: ReactNode;
  center?: ReactNode;
  /** Fixed to the screen bottom, over the card. The list uses the in-flow bar. */
  pin?: boolean;
  label?: string;
}) {
  useMainLayout();
  return (
    <nav
      aria-label={label}
      className={cn(
        "compass-sky-band shrink-0 bg-sky text-[14px] leading-[1.45] font-normal tracking-[0.1em] text-[#111] uppercase select-none [-webkit-touch-callout:none]",
        pin && "pointer-events-auto absolute inset-x-0 z-30",
      )}
      style={{
        height: `var(--band-h, ${browseBandHeightCss()})`,
        bottom: pin ? "var(--vv-bottom, 0px)" : undefined,
        fontFamily: FONT,
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      <div className="grid h-full grid-cols-3 items-center px-8">
        <div className="justify-self-start">{left}</div>
        <div className="justify-self-center">{center}</div>
        <div className="justify-self-end">{right}</div>
      </div>
    </nav>
  );
}
