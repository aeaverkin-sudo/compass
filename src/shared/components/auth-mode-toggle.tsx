"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { photoSlotLookClass } from "@/shared/lib/photo-look";
import { HEADER_ROW_PX } from "@/shared/layout/axes";
import { SCREEN_TOP_AXIS_PX } from "@main/layout";

/** Gap from the bottom of the back-arrow row to the top of this bar. */
const BELOW_BACK_PX = 16;

/** Top edge of the bar: under the back row, then BELOW_BACK_PX. */
const BAR_TOP = `calc(env(safe-area-inset-top) + ${SCREEN_TOP_AXIS_PX}px + ${HEADER_ROW_PX / 2}px + ${BELOW_BACK_PX}px)`;

function Segment({
  href,
  on,
  label,
}: {
  href: string;
  on: boolean;
  label: string;
}) {
  const className = cn(
    "flex min-w-0 flex-1 items-center justify-center t-label whitespace-nowrap no-underline",
    on ? "bg-sky" : "bg-white",
  );
  const style = {
    letterSpacing: "0.12em",
    lineHeight: 1,
    color: on ? "var(--ink)" : "var(--placeholder)",
  };
  if (on) {
    return (
      <span className={className} style={style} aria-current="page">
        {label}
      </span>
    );
  }
  return (
    <Link href={href} className={className} style={style}>
      {label}
    </Link>
  );
}

/** Sign up / Sign in. Pinned stays on the screen. Loose sits under the back arrow and scrolls away. */
export function AuthModeToggle({
  mode,
  signUpHref,
  signInHref,
  pinned = true,
  className,
}: {
  mode: "up" | "in";
  signUpHref: string;
  signInHref: string;
  /** Stays on the screen. The questionnaire turns this off so the row scrolls away. */
  pinned?: boolean;
  className?: string;
}) {
  return (
    <nav
      aria-label="Account"
      className={cn("flex", photoSlotLookClass("shadow"), pinned && "fixed z-[31]", className)}
      style={
        pinned
          ? {
              top: BAR_TOP,
              left: "var(--gutter)",
              right: "var(--gutter)",
              height: HEADER_ROW_PX,
            }
          : {
              marginTop: BAR_TOP,
              marginLeft: "var(--gutter)",
              marginRight: "var(--gutter)",
              height: HEADER_ROW_PX,
            }
      }
    >
      <Segment href={signUpHref} on={mode === "up"} label="Sign up" />
      <Segment href={signInHref} on={mode === "in"} label="Sign in" />
    </nav>
  );
}
