"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Rule } from "@/shared/components/rule";
import { payView } from "@/shared/event/payment-label";
import { formatEventWhen } from "@/shared/event/when";
import type { EventGuest } from "@/shared/services/event-manage";
import { ManageFrame } from "../manage-frame";

type Filter = "all" | "confirmed" | "pending";
type Sort = "name" | "recent";

export function GuestsScreen({
  lookup,
  name,
  guests,
  canMark,
  isPaid,
}: {
  lookup: string;
  name: string;
  guests: EventGuest[];
  canMark: boolean;
  isPaid: boolean;
}) {
  const router = useRouter();
  const back = `/e/${encodeURIComponent(lookup)}/manage`;
  const [rows, setRows] = useState(guests);
  useEffect(() => setRows(guests), [guests]);
  const [sort, setSort] = useState<Sort>("name");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [picked, setPicked] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const confirmed = rows.filter((guest) => payView(guest.paidStatus ?? "", guest.paidSource).key === "confirmed").length;
  const pending = rows.length - confirmed;
  const needle = query.trim().toLowerCase();
  const visible = rows
    .filter((guest) => {
      const key = payView(guest.paidStatus ?? "", guest.paidSource).key;
      if (isPaid && filter === "confirmed" && key !== "confirmed") return false;
      if (isPaid && filter === "pending" && key !== "pending") return false;
      if (needle && !guest.name.toLowerCase().includes(needle)) return false;
      return true;
    })
    .sort((a, b) => {
      if (sort === "recent") {
        const left = a.registeredAt ? new Date(a.registeredAt).getTime() : 0;
        const right = b.registeredAt ? new Date(b.registeredAt).getTime() : 0;
        return right - left || a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
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

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: rows.length },
    { id: "confirmed", label: "Confirmed", count: confirmed },
    { id: "pending", label: "Not confirmed", count: pending },
  ];

  return (
    <ManageFrame title={name} fallbackHref={back} onBack={() => router.replace(back)}>
      {rows.length === 0 ? (
        <p className="mb-0 t-meta text-[var(--grey)]">No guests yet. Share the invite.</p>
      ) : (
        <>
          <div className="flex items-baseline gap-3 pt-[18px]">
            <span className="t-label">Sort</span>
            {(["name", "recent"] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setSort(id)}
                className="press border-0 bg-transparent p-0 t-body [-webkit-tap-highlight-color:transparent]"
                style={{ color: sort === id ? "var(--ink)" : "var(--grey)" }}
              >
                {id === "name" ? "A–Z" : "Recent"}
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name"
            aria-label="Name"
            className="mt-4 w-full border-0 border-b border-[var(--rule)] bg-transparent px-0 pb-1 text-[var(--ink)] outline-none placeholder:text-[var(--placeholder)]"
            style={{ fontSize: 16, fontWeight: 400, letterSpacing: "-0.015em", lineHeight: 1.45 }}
          />
          {isPaid ? (
            <div className="flex flex-wrap gap-x-4 gap-y-2 pt-4">
              {filters.map((item) => {
                const selected = filter === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setFilter(item.id);
                      setPicked(null);
                    }}
                    className={`press border-0 bg-transparent p-0 t-meta [-webkit-tap-highlight-color:transparent] ${
                      selected ? "text-[var(--ink)] underline decoration-1 underline-offset-[3px]" : "text-[var(--grey)]"
                    }`}
                  >
                    {item.label} {item.count}
                  </button>
                );
              })}
            </div>
          ) : null}
          <ul className="pt-2">
            {visible.map((guest, index) => {
              const view = payView(guest.paidStatus ?? "", guest.paidSource);
              const open = picked === guest.userId;
              const when = formatEventWhen(guest.registeredAt);
              return (
                <li key={guest.userId}>
                  {index > 0 ? <Rule /> : null}
                  <button
                    type="button"
                    onClick={() => setPicked(open ? null : guest.userId)}
                    className="press flex w-full items-center gap-3 border-0 bg-transparent px-0 py-3 text-left [-webkit-tap-highlight-color:transparent]"
                  >
                    {guest.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={guest.photoUrl} alt="" className="size-10 shrink-0 object-cover" />
                    ) : (
                      <span aria-hidden className="size-10 shrink-0 bg-[#f3f3f3]" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate t-body text-[var(--ink)]">{guest.name}</span>
                      <span className="mt-0.5 block t-meta text-[var(--grey)]">
                        {when ? `Registered ${when}` : "Registered"}
                      </span>
                    </span>
                    {isPaid ? (
                      <span className="shrink-0 text-right t-meta text-[var(--ink)]">
                        <span className="inline-flex items-center gap-1">
                          <span aria-hidden className="inline-block size-1.5 rounded-full" style={{ background: view.dot }} />
                          {view.label}
                        </span>
                        {view.method ? <span className="mt-0.5 block text-[var(--grey)]">{view.method}</span> : null}
                      </span>
                    ) : null}
                  </button>
                  {open ? (
                    <span className="flex flex-wrap gap-x-4 gap-y-1 pb-3">
                      {canMark && isPaid ? (
                        <button
                          type="button"
                          disabled={busyId !== null}
                          onClick={() => void mark(guest)}
                          className="press border-0 bg-transparent p-0 t-meta text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]"
                        >
                          {view.key === "confirmed" ? "Mark not confirmed" : "Mark confirmed"}
                        </button>
                      ) : null}
                      {guest.cardToken ? (
                        <Link href={`/c/${guest.cardToken}`} className="t-meta text-[var(--ink)] no-underline">
                          Open card
                        </Link>
                      ) : null}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {error ? <p className="mt-3 mb-0 t-meta text-[var(--ink)]">{error}</p> : null}
        </>
      )}
    </ManageFrame>
  );
}
