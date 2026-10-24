"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { COLUMN_GAP_PX, HEADER_ROW_PX } from "@/shared/layout/axes";
import { SCREEN_TOP_AXIS_PX } from "@main/layout";

/** Same inset as the back chevron, so the toggle starts one gap to its right. */
const ARROW_TIP_INSET_PX = 7.3;
const CHEVRON_PX = 22;

function Segment({
  href,
  on,
  label,
  split,
}: {
  href: string;
  on: boolean;
  label: string;
  split?: boolean;
}) {
  const className = cn(
    "flex min-w-0 flex-1 items-center justify-center t-label no-underline",
    split && "border-l border-[#d8d8d8]",
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

/** Sign up / Sign in, on the chevron's row, filling the rest of it. */
export function AuthModeToggle({
  mode,
  signUpHref,
  signInHref,
}: {
  mode: "up" | "in";
  signUpHref: string;
  signInHref: string;
}) {
  return (
    <nav
      aria-label="Account"
      className="fixed z-[31] box-border flex border border-[#d8d8d8]"
      style={{
        top: `calc(env(safe-area-inset-top) + ${SCREEN_TOP_AXIS_PX}px - ${HEADER_ROW_PX / 2}px)`,
        left: `calc(var(--gutter) - ${ARROW_TIP_INSET_PX}px + ${CHEVRON_PX}px + ${COLUMN_GAP_PX}px)`,
        right: "var(--gutter)",
        height: HEADER_ROW_PX,
      }}
    >
      <Segment href={signUpHref} on={mode === "up"} label="Sign up" />
      <Segment href={signInHref} on={mode === "in"} label="Sign in" split />
    </nav>
  );
}
