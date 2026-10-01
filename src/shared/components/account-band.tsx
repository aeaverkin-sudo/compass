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
  textDecorationColor: "rgba(119,119,119,0.45)",
  textDecorationThickness: "0.5px",
  textUnderlineOffset: "3px",
} as const;

/**
 * Sky plaque under the portfolio name. The same markup on `/c/`, `/@handle`, and the shared PDF.
 * The title is not a link. Try it and Sign up are. On the web the plaque sits above Safari's toolbar.
 */
export function AccountBand({ inset, safe = true }: { inset?: number; safe?: boolean }) {
  const origin = useOrigin();
  const tryHref = `${origin}/try`;
  const registerHref = `${origin}/register`;
  return (
    <nav
      aria-label="Account"
      className={cn(
        "bg-sky text-center text-[10px] leading-none font-normal tracking-[0.14em] whitespace-nowrap uppercase",
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
      <div className="py-3">
        <p className="m-0 text-[#111]">Get your portfolio</p>
        <p className="m-0 mt-1.5 text-[#999]">
          <a href={tryHref} className="text-[#999]" style={LINK_LINE}>
            Try it
          </a>
          <span className="text-[#ccc]"> · </span>
          <a href={registerHref} className="text-[#999]" style={LINK_LINE}>
            Sign up
          </a>
        </p>
      </div>
    </nav>
  );
}
