"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { photoSlotLookClass } from "@/shared/lib/photo-look";
import { COLUMN_GAP_PX, HEADER_ROW_PX } from "@/shared/layout/axes";
import { SCREEN_TOP_AXIS_PX } from "@main/layout";

/** The back icon is 22px, starting on the gutter. The words start one gap to its right. */
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
    "flex items-center justify-center px-3 t-label whitespace-nowrap no-underline",
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

/** Sign up / Sign in. Pinned stays on the screen. Loose sits on the chevron row and scrolls away. */
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
      className={cn("flex w-max", photoSlotLookClass("shadow"), pinned && "fixed z-[31]", className)}
      style={
        pinned
          ? {
              top: `calc(env(safe-area-inset-top) + ${SCREEN_TOP_AXIS_PX}px - ${HEADER_ROW_PX / 2}px)`,
              left: `calc(var(--gutter) + ${CHEVRON_PX}px + ${COLUMN_GAP_PX}px)`,
              height: HEADER_ROW_PX,
            }
          : {
              marginTop: `calc(env(safe-area-inset-top) + ${SCREEN_TOP_AXIS_PX}px - ${HEADER_ROW_PX / 2}px)`,
              marginLeft: `calc(var(--gutter) + ${CHEVRON_PX}px + ${COLUMN_GAP_PX}px)`,
              height: HEADER_ROW_PX,
            }
      }
    >
      <Segment href={signUpHref} on={mode === "up"} label="Sign up" />
      <Segment href={signInHref} on={mode === "in"} label="Sign in" />
    </nav>
  );
}
