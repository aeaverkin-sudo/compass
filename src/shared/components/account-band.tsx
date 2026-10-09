"use client";

import { useSyncExternalStore } from "react";
import { browseBandHeightCss } from "@main/layout";
import { cn } from "@/lib/utils";

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

function subscribe() {
  return () => {};
}

function originNow() {
  return window.location.origin;
}

function originOnServer() {
  return "";
}

/** Absolute on the client, so a PDF link annotation opens anywhere. */
function useOrigin() {
  return useSyncExternalStore(subscribe, originNow, originOnServer);
}

/**
 * Two doors under the portfolio name. The same markup on `/c/`, `/@handle`, and the shared PDF.
 * On the web the plaque sits above Safari's toolbar.
 */
export function AccountBand({
  token,
  inset,
  safe = true,
  medium,
  onPdf,
  onPreparePdf,
}: {
  token: string;
  inset?: number;
  safe?: boolean;
  /** Painted PDF uses the live-card door. The web plaque keeps Get your PDF file. */
  medium?: "web" | "pdf";
  /** Web door. The painted PDF keeps its own right-hand link. */
  onPdf?: () => void;
  onPreparePdf?: () => void;
}) {
  const origin = useOrigin();
  const pdf = medium === "pdf" || (medium == null && !safe);
  const saveHref = `${origin}/save/${encodeURIComponent(token)}`;
  const liveHref = `${origin}/c/${encodeURIComponent(token)}`;
  const door = cn(
    "press t-caps flex flex-1 touch-manipulation items-center text-[#111] [-webkit-tap-highlight-color:transparent]",
    safe ? "h-full" : "min-h-11 py-3",
  );
  return (
    <nav
      aria-label="Account"
      className={cn(
        "bg-sky text-[var(--ink)]",
        safe && "compass-sky-band",
        inset == null && "px-[calc(clamp(24px,6.1vw,28px)-3mm)]",
      )}
      style={{
        fontFamily: FONT,
        height: safe ? `var(--band-h, ${browseBandHeightCss()})` : undefined,
        paddingLeft: inset,
        paddingRight: inset,
      }}
    >
      <div className={cn("flex items-stretch", safe ? "h-full" : "min-h-11")}>
        <a href={saveHref} className={cn(door, "text-left")}>
          <span data-pdf-link="" className="inline-block w-fit">
            Save to your
            <br />
            network
          </span>
        </a>
        {pdf ? (
          <a href={liveHref} className={cn(door, "justify-end text-right")}>
            <span data-pdf-link="" className="inline-block w-fit">
              Open live
              <br />
              card
            </span>
          </a>
        ) : (
          <button
            type="button"
            onPointerDown={onPreparePdf}
            onClick={onPdf}
            className={cn(door, "justify-end border-0 bg-transparent text-right")}
          >
            <span data-pdf-link="" className="inline-block w-fit">
              Get your
              <br />
              PDF file
            </span>
          </button>
        )}
      </div>
    </nav>
  );
}
