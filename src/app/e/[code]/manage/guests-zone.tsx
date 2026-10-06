"use client";

import Link from "next/link";
import { Zone } from "@/shared/components/zone";

export function GuestsZone({
  href,
  going,
  confirmed,
  checkedIn,
  isPaid,
}: {
  href: string;
  going: number;
  confirmed: number;
  checkedIn: number;
  isPaid: boolean;
}) {
  const line = isPaid
    ? `${going} going · ${confirmed} confirmed · ${checkedIn} in`
    : `${going} going · ${checkedIn} in`;

  return (
    <Zone label="Guests">
      <Link href={href} className="press block t-body text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]">
        {line}
      </Link>
    </Zone>
  );
}
