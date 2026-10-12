"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Rule } from "@/shared/components/rule";
import { SkyToast } from "@/shared/components/sky-toast";
import {
  guestPassUrl,
  guestStatusView,
  isGoing,
  whatsappHref,
  whatsappInvite,
  type BookGuest,
} from "@/shared/event/guest-book";
import { payView } from "@/shared/event/payment-label";
import { formatEventWhen } from "@/shared/event/when";
import { ManageFrame } from "../manage-frame";

type PayFilter = "all" | "confirmed" | "pending";
type GoFilter = "any" | "going" | "not_yet";
type Sort = "name" | "recent";
type ListChip = { id: string; name: string; count: number };

const CHIP = "press border-0 bg-transparent p-0 t-meta [-webkit-tap-highlight-color:transparent]";
const ACTION = "press border-0 bg-transparent p-0 t-meta text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]";

function chipClass(selected: boolean): string {
  return `${CHIP} ${selected ? "text-[var(--ink)] underline decoration-1 underline-offset-[3px]" : "text-[var(--grey)]"}`;
}

function sortTime(guest: BookGuest): number {
  const at = guest.registeredAt ?? guest.addedAt;
  return at ? new Date(at).getTime() : 0;
}

export function GuestsScreen({
  lookup,
  name,
  guests,
  lists,
  initialList,
  inviteUrl,
  canMark,
  isPaid,
}: {
  lookup: string;
  name: string;
  guests: BookGuest[];
  /** Null until guest lists exist. */
  lists: ListChip[] | null;
  initialList: string | null;
  inviteUrl: string;
  canMark: boolean;
  isPaid: boolean;
}) {
  const router = useRouter();
  const back = `/e/${encodeURIComponent(lookup)}/manage`;
  const [rows, setRows] = useState(guests);
  useEffect(() => setRows(guests), [guests]);
  const [sort, setSort] = useState<Sort>("name");
  const [query, setQuery] = useState("");
  const [listFilter, setListFilter] = useState<string | null>(
    initialList && lists?.some((item) => item.id === initialList) ? initialList : null,
  );
  const [goFilter, setGoFilter] = useState<GoFilter>("any");
  const [payFilter, setPayFilter] = useState<PayFilter>("all");
  const [picked, setPicked] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const listNames = new Map((lists ?? []).map((item) => [item.id, item.name]));
  const hasLists = (lists?.length ?? 0) > 0;
  const inList = rows.filter((guest) => !listFilter || guest.listIds.includes(listFilter));
  const going = inList.filter((guest) => isGoing(guest.status)).length;
  const registered = rows.filter((guest) => guest.registrationId);
  const confirmed = registered.filter((guest) => payView(guest.paidStatus ?? "", guest.paidSource).key === "confirmed").length;
  const pending = registered.length - confirmed;
  const needle = query.trim().toLowerCase();
  const visible = inList
    .filter((guest) => {
      if (goFilter === "going" && !isGoing(guest.status)) return false;
      if (goFilter === "not_yet" && isGoing(guest.status)) return false;
      if (isPaid && payFilter !== "all") {
        if (!guest.registrationId) return false;
        const key = payView(guest.paidStatus ?? "", guest.paidSource).key;
        if (payFilter === "confirmed" && key !== "confirmed") return false;
        if (payFilter === "pending" && key !== "pending") return false;
      }
      if (needle && !guest.name.toLowerCase().includes(needle)) return false;
      return true;
    })
    .sort((a, b) => {
      if (sort === "recent") return sortTime(b) - sortTime(a) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });

  const mark = async (guest: BookGuest) => {
    if (!canMark || !isPaid || busyId || !guest.userId) return;
    const confirming = payView(guest.paidStatus ?? "", guest.paidSource).key !== "confirmed";
    const next = {
      ...guest,
      paidStatus: confirming ? "paid" : "unpaid",
      paidSource: confirming ? "manual" : null,
    };
    setRows((current) => current.map((row) => (row.key === guest.key ? next : row)));
    setBusyId(guest.key);
    setError(null);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(lookup)}/payments/${guest.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid: confirming }),
      });
      if (!response.ok) {
        setRows((current) => current.map((row) => (row.key === guest.key ? guest : row)));
        setError("Could not update the guest.");
        return;
      }
      router.refresh();
    } catch {
      setRows((current) => current.map((row) => (row.key === guest.key ? guest : row)));
      setError("Could not update the guest.");
    } finally {
      setBusyId(null);
    }
  };

  const copyLink = async (guest: BookGuest) => {
    if (!guest.token) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(guestPassUrl(inviteUrl, guest.token));
      setNotice("Link copied");
    } catch {
      setNotice("Could not copy");
    }
  };

  const payFilters: { id: PayFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: registered.length },
    { id: "confirmed", label: "Confirmed", count: confirmed },
    { id: "pending", label: "Not confirmed", count: pending },
  ];

  const metaLine = (guest: BookGuest): string => {
    if (!guest.guestId) {
      const when = formatEventWhen(guest.registeredAt);
      return when ? `Registered ${when}` : "Registered";
    }
    const names = guest.listIds.map((id) => listNames.get(id)).filter(Boolean);
    return [guest.email ?? guest.phone, ...names, guest.paidList ? "Paid" : null].filter(Boolean).join(" · ");
  };

  return (
    <ManageFrame title={name} fallbackHref={back} onBack={() => router.replace(back)}>
      {notice ? <SkyToast key={notice} text={notice} onDone={() => setNotice(null)} /> : null}
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
          {hasLists ? (
            <>
              <div className="flex flex-wrap gap-x-4 gap-y-2 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setListFilter(null);
                    setPicked(null);
                  }}
                  className={chipClass(listFilter === null)}
                >
                  {`All ${rows.length}`}
                </button>
                {(lists ?? []).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setListFilter(item.id);
                      setPicked(null);
                    }}
                    className={chipClass(listFilter === item.id)}
                  >
                    {`${item.name} ${item.count}`}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2 pt-2">
                {(
                  [
                    { id: "any", label: "Any" },
                    { id: "going", label: `Going ${going}` },
                    { id: "not_yet", label: `Not yet ${inList.length - going}` },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setGoFilter(item.id);
                      setPicked(null);
                    }}
                    className={chipClass(goFilter === item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          {isPaid ? (
            <div className={`flex flex-wrap gap-x-4 gap-y-2 ${hasLists ? "pt-2" : "pt-4"}`}>
              {payFilters.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setPayFilter(item.id);
                    setPicked(null);
                  }}
                  className={chipClass(payFilter === item.id)}
                >
                  {item.label} {item.count}
                </button>
              ))}
            </div>
          ) : null}
          <ul className="pt-2">
            {visible.map((guest, index) => {
              const view = payView(guest.paidStatus ?? "", guest.paidSource);
              const status = guestStatusView(guest.status);
              const open = picked === guest.key;
              const pass = guest.token ? guestPassUrl(inviteUrl, guest.token) : null;
              const canPay = canMark && isPaid && Boolean(guest.userId);
              return (
                <li key={guest.key}>
                  {index > 0 ? <Rule /> : null}
                  <button
                    type="button"
                    onClick={() => setPicked(open ? null : guest.key)}
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
                      <span className="mt-0.5 block t-meta text-[var(--grey)]">{metaLine(guest)}</span>
                    </span>
                    <span className="shrink-0 text-right t-meta text-[var(--ink)]">
                      <span className="inline-flex items-center gap-1">
                        {status.dot ? (
                          <span aria-hidden className="inline-block size-1.5 rounded-full" style={{ background: status.dot }} />
                        ) : null}
                        {status.label}
                      </span>
                      {isPaid && guest.registrationId ? (
                        <span className="mt-0.5 block text-[var(--grey)]">
                          {view.method ? `${view.label} · ${view.method}` : view.label}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  {open && ((guest.phone && pass) || canPay || guest.cardToken) ? (
                    <span className="flex flex-wrap gap-x-4 gap-y-1 pb-3">
                      {guest.phone && pass ? (
                        <>
                          <a
                            href={whatsappHref(guest.phone, whatsappInvite(guest.name, name, pass))}
                            target="_blank"
                            rel="noreferrer"
                            className="t-meta text-[var(--ink)] underline decoration-1 underline-offset-[3px]"
                          >
                            WhatsApp
                          </a>
                          <button
                            type="button"
                            onClick={() => void copyLink(guest)}
                            className={`${ACTION} underline decoration-1 underline-offset-[3px]`}
                          >
                            Copy link
                          </button>
                        </>
                      ) : null}
                      {canPay ? (
                        <button type="button" disabled={busyId !== null} onClick={() => void mark(guest)} className={ACTION}>
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
