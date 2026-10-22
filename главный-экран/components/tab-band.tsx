"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useMainLayout } from "../hooks/use-main-layout";
import { browseBandHeightCss } from "../layout";

/**
 * The sky plaque under the card. Pinned, it is fixed to the screen bottom.
 */
export function TabBand({
  left,
  right,
  center,
  pin = false,
  label,
  inset = "var(--gutter)",
}: {
  left: ReactNode;
  right: ReactNode;
  center?: ReactNode;
  /** Fixed to the screen bottom, over the card. The list uses the in-flow bar. */
  pin?: boolean;
  label?: string;
  /** Horizontal pad for the door row. Public /c matches the card rule axis. */
  inset?: string;
}) {
  useMainLayout();
  const band = `var(--band-h, ${browseBandHeightCss()})`;
  return (
    <nav
      aria-label={label}
      className={cn(
        "compass-sky-band shrink-0 bg-sky t-band text-[var(--ink)] select-none [-webkit-touch-callout:none]",
        pin && "pointer-events-auto fixed inset-x-0 bottom-0 z-30",
      )}
      style={{
        height: band,
        bottom: pin ? 0 : undefined,
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      <div
        className="flex h-full items-stretch"
        style={{ paddingLeft: inset, paddingRight: inset }}
      >
        <div className="flex min-h-11 min-w-0 flex-1 items-stretch">{left}</div>
        {center != null ? <div className="flex min-h-11 min-w-0 flex-1 items-stretch">{center}</div> : null}
        <div className="flex min-h-11 min-w-0 flex-1 items-stretch">{right}</div>
      </div>
    </nav>
  );
}
