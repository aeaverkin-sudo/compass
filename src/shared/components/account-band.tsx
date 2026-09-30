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

/**
 * Sky plaque under the portfolio name. The same markup on `/c/`, `/@handle`, and the shared PDF.
 * Try it is the lighter entry. Create your account keeps the thin gray underline.
 */
export function AccountBand({ inset, safe = true }: { inset?: number; safe?: boolean }) {
  const origin = useOrigin();
  const tryHref = `${origin}/try`;
  const registerHref = `${origin}/register`;
  return (
    <nav
      aria-label="Account"
      className={cn(
        "bg-sky text-[#111]",
        safe && "compass-sky-band",
        inset == null && "px-[calc(clamp(24px,6.1vw,28px)-3mm)]",
      )}
      style={{
        fontFamily: FONT,
        paddingBottom: safe ? "var(--band-safe, 0px)" : undefined,
        paddingLeft: inset,
        paddingRight: inset,
      }}
    >
      <div className="flex items-start justify-between gap-4 py-3.5">
        <a href={tryHref} className="flex min-w-0 flex-col items-start no-underline">
          <span className="text-[13px] leading-none font-normal">Try it</span>
          <span className="mt-1 text-[10px] leading-none font-light text-[#777]">No sign-up</span>
        </a>
        <a href={registerHref} className="flex min-w-0 flex-col items-end text-right no-underline">
          <span
            className="text-[13px] leading-none font-normal"
            style={{
              textDecoration: "underline",
              textDecorationColor: "rgba(17,17,17,0.28)",
              textDecorationThickness: "0.5px",
              textUnderlineOffset: "3px",
            }}
          >
            Create your account
          </span>
          <span className="mt-1 text-[10px] leading-none font-light text-[#777]">Full access</span>
        </a>
      </div>
    </nav>
  );
}
