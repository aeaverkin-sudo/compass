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
}: {
  token: string;
  inset?: number;
  safe?: boolean;
}) {
  const origin = useOrigin();
  const registerHref = `${origin}/register`;
  const saveHref = `${origin}/save/${encodeURIComponent(token)}`;
  return (
    <nav
      aria-label="Account"
      className={cn(
        "bg-sky text-[10px] leading-[1.6] font-normal tracking-[0.14em] text-[#111] uppercase",
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
        <a
          href={registerHref}
          className="flex min-h-11 flex-1 touch-manipulation items-center py-3 text-left text-[#111] [-webkit-tap-highlight-color:transparent]"
        >
          <span data-pdf-link="" className="inline-block w-fit" style={LINK_LINE}>
            Get your
            <br />
            portfolio
          </span>
        </a>
        <a
          href={saveHref}
          className="flex min-h-11 flex-1 touch-manipulation items-center justify-end py-3 text-right text-[#111] [-webkit-tap-highlight-color:transparent]"
        >
          <span data-pdf-link="" className="inline-block w-fit" style={LINK_LINE}>
            Save this
            <br />
            portfolio
          </span>
        </a>
      </div>
    </nav>
  );
}
