"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Switch } from "@/shared/components/ui/switch";
import { Zone } from "@/shared/components/zone";
import type { EventPay, PaymentTally, StatementReport } from "@/shared/event/payment-label";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";

type PaymentScreenProps = {
  lookup: string;
  pay: EventPay;
  tally: PaymentTally;
};

type Draft = {
  isPaid: boolean;
  howTo: string;
  price: string;
  currency: string;
};

const FIELD = "bg-transparent px-0 t-body text-[var(--ink)] outline-none placeholder:text-[var(--placeholder)]";

function draftFrom(pay: EventPay): Draft {
  return {
    isPaid: pay.isPaid,
    howTo: pay.paymentUrl || pay.paymentNote || "",
    price: pay.price == null ? "" : String(pay.price),
    currency: pay.currency || "EUR",
  };
}

export function PaymentScreen({ lookup, pay, tally }: PaymentScreenProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft>(draftFrom(pay));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<StatementReport | null>(null);

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
        return;
      }
      router.refresh();
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
    setBusy(true);
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
      router.refresh();
    } catch {
      setError("Could not read the statement.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Zone label="Payment" align="start" rule={draft.isPaid}>
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
          </Zone>
          <Zone label="Statement" align="start">
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
              Upload CSV or PDF
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
            <p className="mt-3 mb-0 t-meta text-[var(--grey)]">
              ADED is not a payment processor — money goes straight to you. We only mark who&apos;s confirmed.
            </p>
          </Zone>
        </>
      ) : null}
      {error ? (
        <p className="mb-0 t-meta text-[var(--ink)]" style={{ marginLeft: VALUE_AXIS_PX }}>
          {error}
        </p>
      ) : null}
    </>
  );
}
