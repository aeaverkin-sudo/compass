"use client";

import { useState } from "react";
import Link from "next/link";
import { Zone } from "@/shared/components/zone";

export function GuestsZone({
  href,
  total,
  going,
  confirmed,
  checkedIn,
  isPaid,
  lookup,
  showGoing,
}: {
  href: string;
  /** Unique guests across lists and the shared link. Null before guest lists exist. */
  total: number | null;
  going: number;
  confirmed: number;
  checkedIn: number;
  isPaid: boolean;
  lookup: string;
  showGoing: boolean;
}) {
  const [shown, setShown] = useState(showGoing);
  const [busy, setBusy] = useState(false);
  const counts = isPaid
    ? `${going} going · ${confirmed} confirmed · ${checkedIn} in`
    : `${going} going · ${checkedIn} in`;
  const line = total == null ? counts : `${total} guests · ${counts} ›`;

  const toggle = async () => {
    if (busy) return;
    const next = !shown;
    setBusy(true);
    setShown(next);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(lookup)}/going`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ on: next }),
      });
      if (!response.ok) setShown(!next);
    } catch {
      setShown(!next);
    }
    setBusy(false);
  };

  return (
    <Zone label="Guests">
      <Link href={href} className="press block t-body text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]">
        {line}
      </Link>
      <button
        type="button"
        aria-pressed={shown}
        disabled={busy}
        onClick={() => void toggle()}
        className="press mt-3 block border-0 bg-transparent p-0 text-left t-meta text-[var(--grey)] [-webkit-tap-highlight-color:transparent]"
      >
        {`Guests see who's going · ${shown ? "on" : "off"}`}
      </button>
    </Zone>
  );
}
