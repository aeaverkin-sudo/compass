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
  textDecorationColor: "rgba(17,17,17,0.28)",
  textDecorationThickness: "0.5px",
  textUnderlineOffset: "3px",
} as const;

/**
 * Sky plaque under the portfolio name. The same markup on `/c/`, `/@handle`, and the shared PDF.
 * Only TRY IT and SIGN UP are links. On the web the row sits above Safari's toolbar.
 */
export function AccountBand({ inset, safe = true }: { inset?: number; safe?: boolean }) {
  const origin = useOrigin();
  const tryHref = `${origin}/try`;
  const registerHref = `${origin}/register`;
  return (
    <nav
      aria-label="Account"
      className={cn(
        "bg-sky text-[9px] leading-none font-normal tracking-[0.1em] whitespace-nowrap text-[#111] uppercase",
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
      <div className="flex items-baseline justify-between gap-3 py-3">
        <span className="flex min-w-0 items-baseline gap-2">
          <a href={tryHref} className="text-[#111]" style={LINK_LINE}>
            Try it
          </a>
          <span className="text-[#999]">Limited run</span>
        </span>
        <span className="flex min-w-0 items-baseline justify-end gap-2">
          <span className="text-[#999]">Full access</span>
          <a href={registerHref} className="text-[#111]" style={LINK_LINE}>
            Sign up
          </a>
        </span>
      </div>
    </nav>
  );
}
