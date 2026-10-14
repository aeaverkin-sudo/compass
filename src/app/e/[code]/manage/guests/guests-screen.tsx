"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { Rule } from "@/shared/components/rule";
import { SkyToast } from "@/shared/components/sky-toast";
import {
  guestPassUrl,
  guestStatusView,
  isGoing,
  whatsappHref,
  whatsappInvite,
  type BookGuest,
  type BookList,
} from "@/shared/event/guest-book";
import {
  guestSources,
  isPaidGuest,
  isPendingGuest,
  sourceIds,
  sourceLabel,
  sourceNames,
} from "@/shared/event/guest-sources";
import { ManageFrame } from "../manage-frame";

type StatusFilter = "any" | "not_sent" | "going" | "paid" | "pending" | "in";

const CHIP = "press border-0 bg-transparent p-0 t-meta [-webkit-tap-highlight-color:transparent]";
const ACTION = "press border-0 bg-transparent p-0 t-meta text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]";

function chipClass(selected: boolean): string {
  return `${CHIP} ${selected ? "text-[var(--ink)] underline decoration-1 underline-offset-[3px]" : "text-[var(--grey)]"}`;
}

const MATCH: Record<StatusFilter, (guest: BookGuest) => boolean> = {
  any: () => true,
  not_sent: (guest) => guest.status === "not_sent",
  going: (guest) => isGoing(guest.status),
  paid: isPaidGuest,
  pending: isPendingGuest,
  in: (guest) => guest.status === "in",
};

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
  lists: BookList[] | null;
  initialList: string | null;
  inviteUrl: string;
  canMark: boolean;
  isPaid: boolean;
}) {
  const router = useRouter();
  const back = `/e/${encodeURIComponent(lookup)}/manage`;
  const [rows, setRows] = useState(guests);
  const [shownGuests, setShownGuests] = useState(guests);
  if (shownGuests !== guests) {
    setShownGuests(guests);
    setRows(guests);
  }
  const books = lists ?? [];
  const sources = guestSources(rows, books);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<string | null>(
    initialList && sources.some((item) => item.id === initialList) ? initialList : null,
  );
  const [status, setStatus] = useState<StatusFilter>("any");
  const [picked, setPicked] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const inSource = rows.filter((guest) => !source || sourceIds(guest, books).includes(source));
  const needle = query.trim().toLowerCase();
  const visible = inSource
    .filter((guest) => MATCH[status](guest))
    .filter((guest) => !needle || guest.name.toLowerCase().includes(needle));

  const statusFilters: { id: StatusFilter; label: string }[] = [
    { id: "any", label: "Any" },
    { id: "not_sent", label: "Not sent" },
    { id: "going", label: "Going" },
    ...(isPaid
      ? ([
          { id: "paid", label: "Paid" },
          { id: "pending", label: "Pending" },
        ] as const)
      : []),
    { id: "in", label: "In" },
  ];

  const mark = async (guest: BookGuest) => {
    if (!canMark || !isPaid || lock.current || !guest.userId) return;
    lock.current = true;
    const confirming = !isPaidGuest(guest);
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
    } catch {
      setRows((current) => current.map((row) => (row.key === guest.key ? guest : row)));
      setError("Could not update the guest.");
    } finally {
      lock.current = false;
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

  const metaLine = (guest: BookGuest): string =>
    [guest.email ?? guest.phone, ...sourceNames(guest, books), isPaid && (isPaidGuest(guest) || guest.paidList) ? "Paid" : null]
      .filter(Boolean)
      .join(" · ");

  const statusOf = (guest: BookGuest): { label: string; dot: string | null } => {
    if (guest.bounced && !isGoing(guest.status)) return { label: "Bounced", dot: null };
    if (isPaid && isPendingGuest(guest) && guest.status !== "in") return { label: "Payment pending", dot: "var(--pay-pending)" };
    return guestStatusView(guest.status);
  };

  const pick = (apply: () => void) => {
    apply();
    setPicked(null);
  };

  return (
    <ManageFrame title={name} fallbackHref={back} onBack={() => router.replace(back)}>
      {notice ? <SkyToast key={notice} text={notice} onDone={() => setNotice(null)} /> : null}
      {rows.length === 0 ? (
        <p className="mb-0 t-meta text-[var(--grey)]">No guests yet. Share the invite.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-2 pt-[18px]">
            <button type="button" onClick={() => pick(() => setSource(null))} className={chipClass(source === null)}>
              {`All ${rows.length}`}
            </button>
            {sources.map((item) => (
              <button key={item.id} type="button" onClick={() => pick(() => setSource(item.id))} className={chipClass(source === item.id)}>
                {`${sourceLabel(item.kind, item.name)} ${item.total}`}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 pt-2">
            {statusFilters.map((item) => (
              <button key={item.id} type="button" onClick={() => pick(() => setStatus(item.id))} className={chipClass(status === item.id)}>
                {item.id === "any" ? item.label : `${item.label} ${inSource.filter(MATCH[item.id]).length}`}
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
          <ul className="pt-2">
            {visible.map((guest, index) => {
              const view = statusOf(guest);
              const open = picked === guest.key;
              const pass = guest.token ? guestPassUrl(inviteUrl, guest.token) : null;
              const canPay = canMark && isPaid && Boolean(guest.userId);
              return (
                <li key={guest.key}>
                  {index > 0 ? <Rule /> : null}
                  <button
                    type="button"
                    onClick={() => setPicked(open ? null : guest.key)}
                    className="press flex w-full items-baseline gap-3 border-0 bg-transparent px-0 py-3 text-left [-webkit-tap-highlight-color:transparent]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate t-body text-[var(--ink)]">{guest.name}</span>
                      <span className="mt-0.5 block t-meta text-[var(--grey)]">{metaLine(guest)}</span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 t-meta text-[var(--ink)]">
                      {view.dot ? <span aria-hidden className="inline-block size-1.5 rounded-full" style={{ background: view.dot }} /> : null}
                      {view.label}
                    </span>
                  </button>
                  {open && (pass || canPay || guest.cardToken) ? (
                    <span className="flex flex-wrap gap-x-4 gap-y-1 pb-3">
                      {guest.phone && pass ? (
                        <a
                          href={whatsappHref(guest.phone, whatsappInvite(guest.name, name, pass))}
                          target="_blank"
                          rel="noreferrer"
                          className="t-meta text-[var(--ink)] underline decoration-1 underline-offset-[3px]"
                        >
                          WhatsApp
                        </a>
                      ) : null}
                      {pass ? (
                        <button
                          type="button"
                          onClick={() => void copyLink(guest)}
                          className={`${ACTION} underline decoration-1 underline-offset-[3px]`}
                        >
                          Copy link
                        </button>
                      ) : null}
                      {canPay ? (
                        <button type="button" disabled={busyId !== null} onClick={() => void mark(guest)} className={ACTION}>
                          {busyId === guest.key ? "Saving…" : isPaidGuest(guest) ? "Mark unpaid" : "Mark paid"}
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
          <Rule />
          <a
            href={`/api/events/${encodeURIComponent(lookup)}/guests/export`}
            download
            className="press mt-[18px] inline-flex items-center gap-2 t-body text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]"
          >
            <Download size={16} strokeWidth={1.25} className="shrink-0 text-[var(--ink)]" />
            Export — CSV with statuses
          </a>
        </>
      )}
    </ManageFrame>
  );
}
