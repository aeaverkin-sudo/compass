"use client";

import { startTransition, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/shared/components/ui/switch";
import { Zone } from "@/shared/components/zone";
import { Rule } from "@/shared/components/rule";
import type { BookGuest } from "@/shared/event/guest-book";
import { isPaidGuest, isPendingGuest } from "@/shared/event/guest-sources";
import { priceLabel, type EventPay, type PaymentTally, type StatementReport } from "@/shared/event/payment-label";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";
import { ManageFrame } from "../manage-frame";

type PaymentScreenProps = {
  lookup: string;
  pay: EventPay;
  tally: PaymentTally;
  guests: BookGuest[];
};

type Draft = {
  isPaid: boolean;
  howTo: string;
  price: string;
  currency: string;
};

const FIELD = "bg-transparent px-0 t-body text-[var(--ink)] outline-none placeholder:text-[var(--placeholder)]";
const ACTION =
  "press shrink-0 border-0 bg-transparent p-0 t-meta text-[var(--ink)] underline decoration-1 underline-offset-[3px] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]";

function draftFrom(pay: EventPay): Draft {
  return {
    isPaid: pay.isPaid,
    howTo: pay.paymentUrl || pay.paymentNote || "",
    price: pay.price == null ? "" : String(pay.price),
    currency: pay.currency || "EUR",
  };
}

function priceOf(draft: Draft): number | null {
  const value = Number(draft.price.trim().replace(",", "."));
  return draft.price.trim() !== "" && Number.isFinite(value) ? value : null;
}

export function PaymentScreen({ lookup, pay, tally, guests }: PaymentScreenProps) {
  const router = useRouter();
  const back = `/e/${encodeURIComponent(lookup)}/manage`;
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft>(draftFrom(pay));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<StatementReport | null>(null);
  const [rows, setRows] = useState(guests);
  const [shownGuests, setShownGuests] = useState(guests);
  if (shownGuests !== guests) {
    setShownGuests(guests);
    setRows(guests);
  }
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const markLock = useRef(false);

  const save = async (next: Draft) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(lookup)}/payments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isPaid: next.isPaid,
          howTo: next.howTo.trim(),
          price: next.price.trim() === "" ? null : next.price.trim(),
          currency: next.currency.trim(),
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Could not save payment.");
      }
    } catch {
      setError("Could not save payment.");
    } finally {
      setBusy(false);
    }
  };

  const commit = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    void save(next);
  };

  const importFile = async (file: File) => {
    if (busy) return;
    setBusy(true);
    setUploading(true);
    setError(null);
    setReport(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(`/api/events/${encodeURIComponent(lookup)}/payments/import`, { method: "POST", body: form });
      const body = (await response.json()) as { report?: StatementReport; error?: string };
      if (!response.ok || !body.report) {
        setError(body.error ?? "Could not read the statement.");
        return;
      }
      setReport(body.report);
      // «still unpaid» and the guest list are recounted on the server from the matched payments.
      startTransition(() => router.refresh());
    } catch {
      setError("Could not read the statement.");
    } finally {
      setBusy(false);
      setUploading(false);
    }
  };

  const mark = async (guest: BookGuest) => {
    if (markLock.current || !guest.userId) return;
    markLock.current = true;
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
      }
    } catch {
      setRows((current) => current.map((row) => (row.key === guest.key ? guest : row)));
      setError("Could not update the guest.");
    } finally {
      markLock.current = false;
      setBusyId(null);
    }
  };

  const confirmed = rows.filter(isPaidGuest).length;
  const pending = rows.filter(isPendingGuest).length;
  const unpaid = rows.length - confirmed - pending;
  const price = priceOf(draft);
  const money = (count: number) => (price == null ? null : priceLabel(count * price, draft.currency));
  const needle = query.trim().toLowerCase();
  const visible = rows.filter((guest) => !needle || guest.name.toLowerCase().includes(needle));

  return (
    <ManageFrame title="Payment" fallbackHref={back} onBack={() => router.replace(back)}>
      <Zone label="Entry" align="start" rule>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Switch
              checked={draft.isPaid}
              disabled={busy}
              onCheckedChange={(checked) => commit({ isPaid: checked === true })}
              aria-label="Paid entry"
            />
            <span className="t-body text-[var(--ink)]">{draft.isPaid ? "Paid entry" : "Free"}</span>
          </div>
          {draft.isPaid ? (
            <div className="flex items-baseline gap-2">
              <input
                aria-label="Price"
                inputMode="decimal"
                value={draft.price}
                placeholder="0"
                disabled={busy}
                onChange={(event) => setDraft((current) => ({ ...current, price: event.target.value }))}
                onBlur={(event) => {
                  const next = { ...draft, price: event.target.value };
                  setDraft(next);
                  void save(next);
                }}
                className={`${FIELD} w-[6ch]`}
              />
              <input
                aria-label="Currency"
                value={draft.currency}
                placeholder="EUR"
                maxLength={8}
                disabled={busy}
                onChange={(event) => setDraft((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
                onBlur={(event) => {
                  const next = { ...draft, currency: event.target.value.toUpperCase() };
                  setDraft(next);
                  void save(next);
                }}
                className={`${FIELD} w-[5ch] uppercase`}
              />
            </div>
          ) : null}
        </div>
      </Zone>
      {draft.isPaid ? (
        <>
          <Zone label="How to pay" align="start" rule>
            <input
              aria-label="How to pay"
              value={draft.howTo}
              placeholder="https:// or MB WAY"
              disabled={busy}
              onChange={(event) => setDraft((current) => ({ ...current, howTo: event.target.value }))}
              onBlur={(event) => {
                const next = { ...draft, howTo: event.target.value };
                setDraft(next);
                void save(next);
              }}
              className={`${FIELD} w-full`}
            />
            <p className="mt-1 mb-0 t-meta text-[var(--grey)]">
              A link (Revolut, Stripe, PayPal) or plain text like MB WAY 912 345 678.
            </p>
            <p className="mt-3 mb-0 t-meta text-[var(--grey)]">
              ADED is not a payment processor — money goes straight to you. We only mark who&apos;s confirmed.
            </p>
          </Zone>
          <Zone label="Statement" align="start" rule>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.pdf,text/csv,application/pdf"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void importFile(file);
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="press inline-flex items-center gap-2 border-0 bg-transparent p-0 text-left t-body text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]"
            >
              <Upload className="text-[var(--ink)]" size={16} strokeWidth={1.25} />
              {uploading ? "Uploading…" : "Upload CSV or PDF"}
            </button>
            <p className="mt-3 mb-0 t-meta text-[var(--grey)]">
              Upload your bank statement — CSV, or a PDF with selectable text. We match each guest by code, then by name, and don&apos;t store the file.
            </p>
            {report ? (
              <div className="mt-3">
                <p className="mb-0 t-meta text-[var(--grey)]">
                  {`Confirmed ${report.byCode} by code, ${report.byName} by name · ${tally.notConfirmed} still unpaid.`}
                </p>
                <p className="mt-2 mb-0 t-meta text-[var(--grey)]">{`${report.notMatched.length} payments not matched`}</p>
                {report.notMatched.length > 0 ? (
                  <ul className="mt-2">
                    {report.notMatched.map((line, index) => (
                      <li key={`${line.text}-${index}`} className="t-meta text-[var(--grey)]">
                        {`${line.amount} · ${line.text}`}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {report.notes.length > 0 ? (
                  <ul className="mt-2">
                    {report.notes.map((note, index) => (
                      <li key={`${note}-${index}`} className="t-meta text-[var(--grey)]">
                        {note}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </Zone>
          <Zone label="Money" align="start" rule>
            {money(confirmed) ? <p className="mb-0 t-body text-[var(--ink)]">{money(confirmed)}</p> : null}
            <p className={cn("mb-0 t-meta text-[var(--grey)]", money(confirmed) && "mt-1")}>
              {[`${confirmed} of ${confirmed + pending} paid`, money(pending) ? `${money(pending)} pending` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </Zone>
          <Zone
            label={
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
                className="press inline-flex items-center gap-1 border-0 bg-transparent p-0 t-label text-[var(--ink)] [-webkit-tap-highlight-color:transparent]"
              >
                Guests
                <ChevronDown size={14} strokeWidth={1.25} className={cn("shrink-0 transition-transform", open && "rotate-180")} />
              </button>
            }
            align="start"
            rule={!open}
          >
            <p className="mb-0 t-body text-[var(--ink)]">{`${confirmed} confirmed · ${pending} pending · ${unpaid} unpaid`}</p>
          </Zone>
          {open ? (
            <div className="border-b border-[var(--rule)] pb-[18px]">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Name"
                  aria-label="Name"
                  className="w-full border-0 border-b border-[var(--rule)] bg-transparent px-0 pb-1 text-[var(--ink)] outline-none placeholder:text-[var(--placeholder)]"
                  style={{ fontSize: 16, fontWeight: 400, letterSpacing: "-0.015em", lineHeight: 1.45 }}
                />
                <ul className="max-h-[300px] overflow-y-auto overscroll-contain">
                  {visible.map((guest, index) => {
                    const paid = isPaidGuest(guest);
                    const waiting = isPendingGuest(guest);
                    return (
                      <li key={guest.key}>
                        {index > 0 ? <Rule /> : null}
                        <div className="flex items-baseline gap-3 py-3">
                          <span className="min-w-0 flex-1 truncate t-body text-[var(--ink)]">{guest.name}</span>
                          <span
                            className={cn("shrink-0 t-meta", paid ? "text-[var(--pay-confirmed)]" : "text-[var(--grey)]")}
                          >
                            {paid ? "$" : waiting ? "pending" : "unpaid"}
                          </span>
                          {guest.userId ? (
                            <button type="button" disabled={busyId !== null} onClick={() => void mark(guest)} className={ACTION}>
                              {busyId === guest.key ? "Saving…" : paid ? "Mark unpaid" : "Mark paid"}
                            </button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
            </div>
          ) : null}
          <div className="flex flex-col gap-1 py-[18px] t-meta text-[var(--grey)]" style={{ marginLeft: VALUE_AXIS_PX }}>
            <span>
              <span className="text-[var(--ink)]">Confirmed</span> — paid, matched by the statement or marked by you.
            </span>
            <span>
              <span className="text-[var(--ink)]">Pending</span> — registered, the payment is not confirmed yet.
            </span>
            <span>
              <span className="text-[var(--ink)]">Mark paid</span> — confirm by hand, for cash or a transfer you checked.
            </span>
            <span>
              <span className="text-[var(--pay-confirmed)]">$</span> — paid. The same mark stands in Guests.
            </span>
          </div>
        </>
      ) : null}
      {error ? (
        <p className="mb-0 t-meta text-[var(--ink)]" style={{ marginLeft: VALUE_AXIS_PX }}>
          {error}
        </p>
      ) : null}
    </ManageFrame>
  );
}
