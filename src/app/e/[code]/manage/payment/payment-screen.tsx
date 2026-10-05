"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/shared/components/ui/switch";
import { Zone } from "@/shared/components/zone";
import type { EventPay } from "@/shared/event/payment-label";
import { ManageFrame } from "../manage-frame";

type PaymentScreenProps = {
  lookup: string;
  pay: EventPay;
  returnUrl: string;
};

type Draft = {
  isPaid: boolean;
  paymentUrl: string;
  price: string;
  currency: string;
  badgeGate: boolean;
};

const FIELD = "bg-transparent t-body text-[var(--ink)] outline-none placeholder:text-[var(--placeholder)]";

function draftFrom(pay: EventPay): Draft {
  return {
    isPaid: pay.isPaid,
    paymentUrl: pay.paymentUrl ?? "",
    price: pay.price == null ? "" : String(pay.price),
    currency: pay.currency || "EUR",
    badgeGate: pay.badgeGate,
  };
}

export function PaymentScreen({ lookup, pay, returnUrl }: PaymentScreenProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft>(draftFrom(pay));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{ matched: number; total: number; unmatched: string[] } | null>(null);

  const save = async (next: Draft) => {
    if (next.isPaid && !/^https?:\/\//i.test(next.paymentUrl.trim())) {
      setError("Add a pay link.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(lookup)}/payments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isPaid: next.isPaid,
          paymentUrl: next.paymentUrl.trim(),
          price: next.price.trim() === "" ? null : next.price.trim(),
          currency: next.currency.trim(),
          badgeGate: next.badgeGate,
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
      const body = (await response.json()) as { matched?: number; total?: number; unmatched?: string[]; error?: string };
      if (!response.ok || body.matched == null || body.total == null || !body.unmatched) {
        setError(body.error ?? "Could not import the statement.");
        return;
      }
      setReport({ matched: body.matched, total: body.total, unmatched: body.unmatched });
      router.refresh();
    } catch {
      setError("Could not import the statement.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ManageFrame title="Payment" fallbackHref={`/e/${encodeURIComponent(lookup)}/manage`}>
      <Zone label="Paid" align="start" rule>
        <div className="flex flex-col gap-3">
          <Switch
            checked={draft.isPaid}
            disabled={busy}
            onCheckedChange={(checked) => commit({ isPaid: checked === true })}
            aria-label="Paid"
          />
          <div className="flex items-center gap-3">
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
              className={`${FIELD} w-24`}
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
              className={`${FIELD} w-16 uppercase`}
            />
          </div>
        </div>
      </Zone>
      <Zone label="Pay link" align="start" rule>
        <input
          aria-label="Pay link"
          value={draft.paymentUrl}
          placeholder="https://"
          disabled={busy}
          onChange={(event) => setDraft((current) => ({ ...current, paymentUrl: event.target.value }))}
          onBlur={(event) => {
            const next = { ...draft, paymentUrl: event.target.value };
            setDraft(next);
            void save(next);
          }}
          className={`${FIELD} w-full`}
        />
      </Zone>
      <Zone label="Return" align="start" rule>
        <input aria-label="Return URL" readOnly value={returnUrl} className={`${FIELD} w-full`} />
        <p className="mt-1 mb-0 t-meta text-[var(--grey)]">
          укажите это как success/return URL в своём чекауте — вернувшийся гость автоматически получит статус оплачено
        </p>
      </Zone>
      <Zone label="Reconcile" align="start" rule>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
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
          className="press border-0 bg-transparent p-0 text-left t-body text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]"
        >
          Import statement (CSV)
        </button>
        {report ? (
          <div className="mt-3">
            <p className="mb-0 t-body text-[var(--ink)]">
              {`${report.matched} of ${report.total} matched by email · ${report.unmatched.length} unmatched`}
            </p>
            {report.unmatched.length > 0 ? (
              <ul className="mt-2">
                {report.unmatched.map((email, index) => (
                  <li key={`${email}-${index}`} className="t-meta text-[var(--grey)]">
                    {email}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </Zone>
      <Zone label="Badge gate" align="center">
        <div className="flex items-center gap-3">
          <Switch
            checked={draft.badgeGate}
            disabled={busy}
            onCheckedChange={(checked) => commit({ badgeGate: checked === true })}
            aria-labelledby="badge-gate"
          />
          <span id="badge-gate" className="t-body text-[var(--ink)]">
            Active only when paid
          </span>
        </div>
      </Zone>
      {error ? <p className="mb-0 t-meta text-[var(--ink)]">{error}</p> : null}
      <p className="mt-2 mb-0 t-meta text-[var(--grey)]">
        ADED is not a payment processor — money goes straight to you. We only mark who paid.
      </p>
    </ManageFrame>
  );
}
