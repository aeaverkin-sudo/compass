"use client";

import Link from "next/link";
import { Zone } from "@/shared/components/zone";

export function GuestsZone({
  href,
  total,
  going,
  confirmed,
  checkedIn,
  isPaid,
}: {
  href: string;
  /** Unique guests across lists and the shared link. Null before guest lists exist. */
  total: number | null;
  going: number;
  confirmed: number;
  checkedIn: number;
  isPaid: boolean;
}) {
  const counts = isPaid
    ? `${going} going · ${confirmed} confirmed · ${checkedIn} in`
    : `${going} going · ${checkedIn} in`;
  const line = total == null ? counts : `${total} guests · ${counts} ›`;

  return (
    <Zone label="Guests">
      <Link href={href} className="press block t-body text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]">
        {line}
      </Link>
    </Zone>
  );
}
