"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { photoSlotLookClass } from "@/shared/lib/photo-look";
import { COLUMN_GAP_PX, HEADER_ROW_PX } from "@/shared/layout/axes";
import { SCREEN_TOP_AXIS_PX } from "@main/layout";

/** Same inset as the back chevron, so a pinned toggle starts one gap to its right. */
const ARROW_TIP_INSET_PX = 7.3;
const CHEVRON_PX = 22;

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
    "flex min-w-0 flex-1 items-center justify-center t-label no-underline",
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

/** Sign up / Sign in. Pinned sits on the chevron row. Loose is a line in the scroll. */
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
  /** Stays on the chevron row. The questionnaire turns this off so the line scrolls away. */
  pinned?: boolean;
  className?: string;
}) {
  return (
    <nav
      aria-label="Account"
      className={cn("flex", photoSlotLookClass("shadow"), pinned ? "fixed z-[31]" : "w-full", className)}
      style={
        pinned
          ? {
              top: `calc(env(safe-area-inset-top) + ${SCREEN_TOP_AXIS_PX}px - ${HEADER_ROW_PX / 2}px)`,
              left: `calc(var(--gutter) - ${ARROW_TIP_INSET_PX}px + ${CHEVRON_PX}px + ${COLUMN_GAP_PX}px)`,
              right: "var(--gutter)",
              height: HEADER_ROW_PX,
            }
          : { height: HEADER_ROW_PX }
      }
    >
      <Segment href={signUpHref} on={mode === "up"} label="Sign up" />
      <Segment href={signInHref} on={mode === "in"} label="Sign in" />
    </nav>
  );
}
