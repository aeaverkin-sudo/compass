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
 * Both labels are one underlined line. Try it is the heavier entry.
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
      <div className="flex items-baseline justify-between gap-3 py-3.5">
        <a
          href={tryHref}
          className="min-w-0 text-[13px] leading-none whitespace-nowrap text-[#111]"
          style={{ ...LINK_LINE, fontWeight: 600 }}
        >
          Try it — no sign-up
        </a>
        <a
          href={registerHref}
          className="min-w-0 text-right text-[13px] leading-none whitespace-nowrap text-[#111]"
          style={{ ...LINK_LINE, fontWeight: 400 }}
        >
          Create your account
        </a>
      </div>
    </nav>
  );
}
