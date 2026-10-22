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
 */
const ZONE_GAP = "12px";

function TapZone({ edge, children }: { edge: "left" | "center" | "right"; children: ReactNode }) {
  return (
    <div
      className="absolute bottom-0 overflow-hidden"
      style={{
        top: "10%",
        left: edge === "left" ? 0 : ZONE_GAP,
        right: edge === "right" ? 0 : ZONE_GAP,
      }}
    >
      <div
        className="absolute flex"
        style={{
          top: "calc(100% / -9)",
          height: "calc(100% / 0.9)",
          width: edge === "center" ? `calc(100% + ${ZONE_GAP} * 2)` : `calc(100% + ${ZONE_GAP})`,
          left: edge === "right" ? undefined : edge === "center" ? `calc(${ZONE_GAP} * -1)` : 0,
          right: edge === "right" ? 0 : undefined,
        }}
      >
        {children}
      </div>
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
        <div className="relative flex min-h-11 min-w-0 flex-1 items-stretch">
          {zoned ? <TapZone edge="left">{left}</TapZone> : left}
        </div>
        {center != null ? (
          <div className="relative flex min-h-11 min-w-0 flex-1 items-stretch">
            <TapZone edge="center">{center}</TapZone>
          </div>
        ) : null}
        <div className="relative flex min-h-11 min-w-0 flex-1 items-stretch">
          {zoned ? <TapZone edge="right">{right}</TapZone> : right}
        </div>
      </div>
    </nav>
  );
}
