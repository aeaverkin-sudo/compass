"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Zone } from "@/shared/components/zone";
import { payView } from "@/shared/event/payment-label";
import type { EventGuest } from "@/shared/services/event-manage";

const PER_ROW_KEY = "aded:guests-per-row";
const PAGE = 24;

type Filter = "all" | "confirmed" | "pending";
type PerRow = 2 | 4 | 6;

function face(guest: EventGuest, size: number) {
  return guest.photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={guest.photoUrl} alt="" className="object-cover" style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden className="block bg-[#f3f3f3]" style={{ width: size, height: size }} />
  );
}

export function GuestsZone({
  lookup,
  guests,
  canMark,
  isPaid,
}: {
  lookup: string;
  guests: EventGuest[];
  canMark: boolean;
  isPaid: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(guests);
  const [perRow, setPerRow] = useState<PerRow>(4);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [shown, setShown] = useState(PAGE);
  const [picked, setPicked] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setRows(guests), [guests]);
  useEffect(() => {
    const raw = localStorage.getItem(PER_ROW_KEY);
    if (raw === "2" || raw === "4" || raw === "6") setPerRow(Number(raw) as PerRow);
  }, []);

  const confirmed = rows.filter((guest) => payView(guest.paidStatus ?? "", guest.paidSource).key === "confirmed").length;
  const checkedIn = rows.filter((guest) => guest.checkedIn).length;
  const pending = rows.length - confirmed;
  const needle = query.trim().toLowerCase();
  const visible = rows.filter((guest) => {
    const key = payView(guest.paidStatus ?? "", guest.paidSource).key;
    if (filter === "confirmed" && key !== "confirmed") return false;
    if (filter === "pending" && key !== "pending") return false;
    if (needle && !guest.name.toLowerCase().includes(needle)) return false;
    return true;
  });
  const page = visible.slice(0, shown);

  const chooseRow = (next: PerRow) => {
    setPerRow(next);
    try {
      localStorage.setItem(PER_ROW_KEY, String(next));
    } catch {
      /* the choice still applies for this visit */
    }
  };

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
    <Zone label="Guests" align="start">
      {rows.length === 0 ? (
        <p className="mb-0 t-meta text-[var(--grey)]">No guests yet. Share the invite.</p>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="press flex w-full items-center justify-between gap-3 border-0 bg-transparent p-0 text-left text-[var(--ink)] [-webkit-tap-highlight-color:transparent]"
          >
            <span className="min-w-0 t-body">
              {rows.length} going{isPaid ? ` · ${confirmed} confirmed` : ""} · {checkedIn} in
            </span>
            {open ? (
              <ChevronUp className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
            ) : (
              <ChevronDown className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
            )}
          </button>
          {open ? (
            <div className="pt-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="t-label">Per row</span>
                <span className="t-caps">
                  {([2, 4, 6] as const).map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => chooseRow(count)}
                      className="press border-0 bg-transparent p-0 [-webkit-tap-highlight-color:transparent]"
                      style={{ color: perRow === count ? "var(--ink)" : "var(--grey)", marginLeft: 10 }}
                    >
                      {count}
                    </button>
                  ))}
                </span>
              </div>
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setShown(PAGE);
                }}
                placeholder="Name"
                aria-label="Name"
                className="mt-4 w-full border-0 border-b border-[var(--rule)] bg-transparent pb-1 text-[var(--ink)] outline-none placeholder:text-[var(--placeholder)]"
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
                          setShown(PAGE);
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
              <ul
                className="pt-4"
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))`,
                  columnGap: 6,
                  rowGap: 12,
                }}
              >
                {page.map((guest) => {
                  const view = payView(guest.paidStatus ?? "", guest.paidSource);
                  const active = picked === guest.userId;
                  return (
                    <li key={guest.userId} style={active ? { gridColumn: "1 / -1" } : undefined}>
                      <button
                        type="button"
                        onClick={() => setPicked(active ? null : guest.userId)}
                        className="press block w-full border-0 bg-transparent p-0 text-left [-webkit-tap-highlight-color:transparent]"
                      >
                        {active ? (
                          <span className="flex items-center gap-3">
                            {face(guest, 40)}
                            <span className="min-w-0">
                              <span className="block t-body text-[var(--ink)]">{guest.name}</span>
                              {isPaid ? (
                                <span className="mt-1 flex flex-wrap items-center gap-x-2 t-meta text-[var(--ink)]">
                                  <span aria-hidden className="inline-block size-1.5 rounded-full" style={{ background: view.dot }} />
                                  {view.long}
                                  {view.method ? <span className="text-[var(--grey)]">{view.method}</span> : null}
                                </span>
                              ) : null}
                            </span>
                          </span>
                        ) : (
                          <>
                            <span className="block aspect-square w-full bg-[#f3f3f3]">
                              {guest.photoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={guest.photoUrl} alt="" className="size-full object-cover" />
                              ) : null}
                            </span>
                            {perRow === 6 ? null : (
                              <>
                                <span className="mt-1 block truncate t-meta text-[var(--ink)]" style={{ fontSize: 11 }}>
                                  {guest.name}
                                </span>
                                {isPaid ? (
                                  <span className="mt-0.5 flex items-center gap-1 t-meta text-[var(--ink)]" style={{ fontSize: 11 }}>
                                    <span aria-hidden className="inline-block size-1.5 shrink-0 rounded-full" style={{ background: view.dot }} />
                                    <span className="truncate">{view.label}</span>
                                  </span>
                                ) : null}
                              </>
                            )}
                          </>
                        )}
                      </button>
                      {active ? (
                        <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
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
              {visible.length > shown ? (
                <button
                  type="button"
                  onClick={() => setShown((current) => current + PAGE)}
                  className="press mt-4 border-0 bg-transparent p-0 t-body text-[var(--ink)] [-webkit-tap-highlight-color:transparent]"
                >
                  Show more
                </button>
              ) : null}
              {error ? <p className="mt-3 mb-0 t-meta text-[var(--ink)]">{error}</p> : null}
            </div>
          ) : (
            <div className="flex items-center gap-1 pt-3">
              {rows.slice(0, 5).map((guest) => (
                <span key={guest.userId}>{face(guest, 30)}</span>
              ))}
              {rows.length > 5 ? <span className="t-meta text-[var(--grey)]">+{rows.length - 5}</span> : null}
            </div>
          )}
        </>
      )}
    </Zone>
  );
}
