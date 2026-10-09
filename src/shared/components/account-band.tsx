"use client";

import { useSyncExternalStore } from "react";
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

const LINK_LINE = {
  textDecoration: "underline",
  textDecorationColor: "rgba(17,17,17,0.45)",
  textDecorationThickness: "0.5px",
  textUnderlineOffset: "3px",
} as const;

/**
 * Two doors under the portfolio name. The same markup on `/c/`, `/@handle`, and the shared PDF.
 * On the web the plaque sits above Safari's toolbar.
 */
export function AccountBand({
  token,
  inset,
  safe = true,
  onPdf,
  onPreparePdf,
}: {
  token: string;
  inset?: number;
  safe?: boolean;
  /** Web door. The painted PDF keeps its own right-hand link. */
  onPdf?: () => void;
  onPreparePdf?: () => void;
}) {
  const origin = useOrigin();
  const registerHref = `${origin}/register`;
  const saveHref = `${origin}/save/${encodeURIComponent(token)}`;
  const door =
    "press flex min-h-11 flex-1 touch-manipulation items-center py-3 text-[#111] [-webkit-tap-highlight-color:transparent]";
  return (
    <nav
      aria-label="Account"
      className={cn(
        "bg-sky t-caps text-[var(--ink)]",
        safe && "compass-sky-band",
        inset == null && "px-[calc(clamp(24px,6.1vw,28px)-3mm)]",
      )}
      style={{
        fontFamily: FONT,
        paddingBottom: safe ? "calc(var(--band-safe, 0px) + var(--vv-bottom, 0px))" : undefined,
        paddingLeft: inset,
        paddingRight: inset,
      }}
    >
      <div className="flex min-h-11 items-stretch">
        <a href={saveHref} className={cn(door, "text-left")}>
          <span data-pdf-link="" className="inline-block w-fit" style={LINK_LINE}>
            Save to your
            <br />
            network
          </span>
        </a>
        {onPdf ? (
          <button
            type="button"
            onPointerDown={onPreparePdf}
            onClick={onPdf}
            className={cn(door, "justify-end border-0 bg-transparent text-right")}
          >
            <span data-pdf-link="" className="inline-block w-fit" style={LINK_LINE}>
              Get your
              <br />
              PDF file
            </span>
          </button>
        ) : (
          <a href={registerHref} className={cn(door, "justify-end text-right")}>
            <span data-pdf-link="" className="inline-block w-fit" style={LINK_LINE}>
              Get your
              <br />
              profile
            </span>
          </a>
        )}
      </div>
    </nav>
  );
}
