"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zone } from "@/shared/components/zone";
import { payView } from "@/shared/event/payment-label";
import { COLUMN_GAP_PX } from "@/shared/layout/axes";
import type { EventGuest } from "@/shared/services/event-manage";
import { CheckMark } from "../check-mark";
import { ManageFrame } from "../manage-frame";

type GuestsScreenProps = {
  lookup: string;
  guests: EventGuest[];
  canMark: boolean;
  isPaid: boolean;
};

type Filter = "all" | "confirmed" | "pending";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "confirmed", label: "Confirmed" },
  { id: "pending", label: "Not confirmed" },
];

export function GuestsScreen({ lookup, guests, canMark, isPaid }: GuestsScreenProps) {
  const router = useRouter();
  const [rows, setRows] = useState(guests);
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirmed = rows.filter((guest) => payView(guest.paidStatus ?? "", guest.paidSource).key === "confirmed").length;
  const checkedIn = rows.filter((guest) => guest.checkedIn).length;
  const visible = rows.filter((guest) => {
    if (!isPaid || filter === "all") return true;
    return payView(guest.paidStatus ?? "", guest.paidSource).key === filter;
  });

  const mark = async (guest: EventGuest) => {
    if (!canMark || !isPaid || busyId) return;
    const confirming = payView(guest.paidStatus ?? "", guest.paidSource).key !== "confirmed";
    const next = {
      ...guest,
      paid: confirming,
      paidStatus: confirming ? "paid" : "unpaid",
      paidSource: confirming ? "manual" : null,
    };
    setRows((current) => current.map((row) => (row.userId === guest.userId ? next : row)));
    setBusyId(guest.userId);
    setError(null);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(lookup)}/payments/${guest.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid: confirming }),
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
        {isPaid
          ? `${rows.length} registered · ${confirmed} confirmed · ${checkedIn} checked-in`
          : `${rows.length} registered · ${checkedIn} checked-in`}
      </p>
      {isPaid ? (
        <div className="flex flex-wrap gap-x-4 gap-y-2 pt-[18px]">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`press border-0 bg-transparent p-0 t-body [-webkit-tap-highlight-color:transparent] ${filter === item.id ? "text-[var(--ink)]" : "text-[var(--grey)]"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
      <Zone label="List" align="start">
        <ul>
          {visible.map((guest) => {
            const view = payView(guest.paidStatus ?? "", guest.paidSource);
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
                    {isPaid ? (
                      <span className="inline-flex items-center gap-1.5 text-[var(--ink)]">
                        <span aria-hidden className="inline-block size-1.5 rounded-full" style={{ background: view.dot }} />
                        {view.label}
                        {view.method ? <span className="text-[var(--grey)]">{view.method}</span> : null}
                      </span>
                    ) : null}
                    {guest.connected ? <span className="text-[var(--ink)]">Connected</span> : null}
                  </span>
                </span>
              </>
            );
            return (
              <li key={guest.id}>
                {canMark && isPaid ? (
                  <button
                    type="button"
                    aria-label={view.key === "confirmed" ? "Mark not confirmed" : "Mark confirmed"}
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
