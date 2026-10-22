"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useMainLayout } from "../hooks/use-main-layout";
import { browseBandHeightCss } from "../layout";

/**
 * The sky plaque under the card. Profile and Network on the card, Event and Data
 * on the contact list: one height, one type, one gutter, one lift above the toolbar.
 *
 * Three slots keep a 24px gap between hit zones. The words stay on the cell edges.
 * The top tenth of the plaque does not hit. The bottom of each zone meets the plaque edge.
 * The buttons stay in the row, so the plaque itself keeps its place on the screen.
 */
/** Half of the 24px gap between neighbouring hit zones. */
const ZONE_GAP = "12px";

function TapZone({ edge, children }: { edge: "left" | "center" | "right"; children: ReactNode }) {
  return (
    <div className="relative flex h-full min-h-11 min-w-0 flex-1 items-stretch">
      {children}
      <div aria-hidden className="absolute inset-x-0 top-0 z-10 h-[10%]" />
      {edge !== "left" ? (
        <div aria-hidden className="absolute bottom-0 left-0 top-[10%] z-10" style={{ width: ZONE_GAP }} />
      ) : null}
      {edge !== "right" ? (
        <div aria-hidden className="absolute bottom-0 right-0 top-[10%] z-10" style={{ width: ZONE_GAP }} />
      ) : null}
    </div>
  );
}

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
  const zoned = center != null;
  return (
    <nav
      aria-label={label}
      className={cn(
        "compass-sky-band shrink-0 bg-sky t-band text-[var(--ink)] select-none [-webkit-touch-callout:none]",
        pin && "pointer-events-auto absolute inset-x-0 z-30",
      )}
      style={{
        height: band,
        bottom: pin ? "var(--vv-bottom, 0px)" : undefined,
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      <div
        className="flex h-full items-stretch"
        style={{ paddingLeft: inset, paddingRight: inset }}
      >
        {zoned ? <TapZone edge="left">{left}</TapZone> : <div className="flex min-h-11 min-w-0 flex-1 items-stretch">{left}</div>}
        {center != null ? <TapZone edge="center">{center}</TapZone> : null}
        {zoned ? <TapZone edge="right">{right}</TapZone> : <div className="flex min-h-11 min-w-0 flex-1 items-stretch">{right}</div>}
      </div>
    </nav>
  );
}
