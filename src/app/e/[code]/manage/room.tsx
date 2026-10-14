"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { SectionNumber, ValueCap, sectionNumberLabel } from "@/shared/components/section-number";

/** Grey caps entry into a room. Same look for every room, no arrows. */
export const ENTRY =
  "press inline-block t-caps text-[var(--grey)] no-underline [-webkit-tap-highlight-color:transparent]";

export function Room({
  index,
  label,
  entry,
  href,
  children,
}: {
  index: number;
  label: string;
  entry: string;
  href: string;
  children?: ReactNode;
}) {
  return (
    <section className="min-w-0 border-b border-[var(--rule)] py-[18px]">
      <div className="grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px]">
        <div className="min-w-0">
          <SectionNumber value={sectionNumberLabel(index)} />
          <span className="t-label mt-[6px] block">{label}</span>
        </div>
        <ValueCap className="min-w-0">
          {children ? <div className="t-body text-[var(--ink)]">{children}</div> : null}
          <Link href={href} className={children ? `mt-2 ${ENTRY}` : ENTRY}>
            {entry}
          </Link>
        </ValueCap>
      </div>
    </section>
  );
}
