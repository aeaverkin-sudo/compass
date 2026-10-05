"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zone } from "@/shared/components/zone";
import { COLUMN_GAP_PX } from "@/shared/layout/axes";
import type { EventGuest } from "@/shared/services/event-manage";
import { CheckMark } from "../check-mark";
import { ManageFrame } from "../manage-frame";

type GuestsScreenProps = {
  lookup: string;
  guests: EventGuest[];
  canMark: boolean;
};

export function GuestsScreen({ lookup, guests, canMark }: GuestsScreenProps) {
  const router = useRouter();
  const [rows, setRows] = useState(guests);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const paid = rows.filter((guest) => guest.paid).length;
  const checkedIn = rows.filter((guest) => guest.checkedIn).length;

  const mark = async (guest: EventGuest) => {
    if (!canMark || busyId) return;
    const next = !guest.paid;
    setRows((current) => current.map((row) => (row.userId === guest.userId ? { ...row, paid: next } : row)));
    setBusyId(guest.userId);
    setError(null);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(lookup)}/payments/${guest.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid: next }),
      });
      if (!response.ok) {
        setRows((current) => current.map((row) => (row.userId === guest.userId ? guest : row)));
        setError("Could not update the guest.");
        return;
      }
      router.refresh();
    } catch {
      setRows((current) => current.map((row) => (row.userId === guest.userId ? guest : row)));
      setError("Could not update the guest.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ManageFrame title="Guests" fallbackHref={`/e/${encodeURIComponent(lookup)}/manage`}>
      <p className="mb-0 t-meta text-[var(--grey)]">
        {`${rows.length} registered · ${paid} paid · ${checkedIn} checked-in`}
      </p>
      <Zone label="List" align="start">
        <ul>
          {rows.map((guest) => {
            const body = (
              <>
                {guest.photoUrl ? (
                  <img src={guest.photoUrl} alt="" className="size-10 shrink-0 object-cover" />
                ) : (
                  <span aria-hidden className="size-10 shrink-0 bg-[#f3f3f3]" />
                )}
                <span className="min-w-0 text-left">
                  <span className="block truncate t-body text-[var(--ink)]">{guest.name}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 t-meta">
                    {guest.checkedIn ? (
                      <span className="inline-flex items-center gap-1 text-[var(--ink)]">
                        <CheckMark />
                        Checked-in
                      </span>
                    ) : (
                      <span className="text-[var(--grey)]">Not checked-in</span>
                    )}
                    <span className={guest.paid ? "text-[var(--ink)]" : "text-[var(--grey)]"}>{guest.paid ? "Paid" : "Unpaid"}</span>
                    {guest.connected ? <span className="text-[var(--ink)]">Connected</span> : null}
                  </span>
                </span>
              </>
            );
            return (
              <li key={guest.id}>
                {canMark ? (
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void mark(guest)}
                    className="press flex w-full items-center border-0 bg-transparent px-0 py-[14px] text-left disabled:opacity-40 [-webkit-tap-highlight-color:transparent]"
                    style={{ gap: COLUMN_GAP_PX }}
                  >
                    {body}
                  </button>
                ) : (
                  <div className="flex items-center py-[14px]" style={{ gap: COLUMN_GAP_PX }}>
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Zone>
      {error ? <p className="mb-0 t-meta text-[var(--ink)]">{error}</p> : null}
    </ManageFrame>
  );
}
