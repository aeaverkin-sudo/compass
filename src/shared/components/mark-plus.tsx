"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

/**
 * Rail Share/Scan frame only (lucide). Not used for MarkPlus —
 * the plus is built from TabBand capital I, not this box.
 */
export const CAPS_PX = 13;
export const CAP_HEIGHT_PX = CAPS_PX * 0.714;
export const MARK_SCALE = 1.25;
export const MARK_VISIBLE_PX = CAP_HEIGHT_PX * MARK_SCALE;
export const MARK_PX = (MARK_VISIBLE_PX * 24) / 19;
export const RAIL_STROKE_PX = 0.9;

type Bar = { length: number; stem: number };

const FALLBACK: Bar = { length: CAP_HEIGHT_PX, stem: RAIL_STROKE_PX };
const SCALE = 8;

/** Ink box of a TabBand capital I: its height is the bar length, its width the stem. */
function measureCapitalI(): Bar | null {
  const size = CAPS_PX * SCALE;
  const canvas = document.createElement("canvas");
  canvas.width = size * 2;
  canvas.height = size * 2;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.font = `300 ${size}px ${FONT}`;
  context.textBaseline = "alphabetic";
  context.fillStyle = "#000";
  context.fillText("I", size / 2, size * 1.5);
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
  let top = height;
  let bottom = -1;
  let left = width;
  let right = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 128) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (bottom < top || right < left) return null;
  return { length: (bottom - top + 1) / SCALE, stem: (right - left + 1) / SCALE };
}

function useCapitalI(): Bar {
  const [bar, setBar] = useState<Bar>(FALLBACK);
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      const measured = measureCapitalI();
      if (!cancelled && measured) setBar(measured);
    };
    if (document.fonts?.ready) void document.fonts.ready.then(run);
    else run();
    return () => {
      cancelled = true;
    };
  }, []);
  return bar;
}

/**
 * Plus in Edit and on the QR rail: two equal bars crossed at the centre.
 * Bar length = height of the TabBand capital I, bar width = its stem.
 */
export function MarkPlus({ className }: { className?: string }) {
  const { length, stem } = useCapitalI();
  return (
    <span
      aria-hidden
      className={cn("relative inline-block shrink-0", className)}
      style={{ width: length, height: length }}
    >
      <span
        className="absolute top-0 left-1/2 h-full -translate-x-1/2 bg-current"
        style={{ width: stem }}
      />
      <span
        className="absolute top-1/2 left-0 w-full -translate-y-1/2 bg-current"
        style={{ height: stem }}
      />
    </span>
  );
}
