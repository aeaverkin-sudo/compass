"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { PortfolioFace } from "@/shared/components/portfolio-face";
import { SkyToast } from "@/shared/components/sky-toast";
import { Zone } from "@/shared/components/zone";
import { CoverButton } from "@/shared/event/cover-button";
import { eventTitleLine } from "@/shared/event/event-title";
import { eventDayLong } from "@/shared/event/when";
import { payLinkWithCode } from "@/shared/event/pay-code";
import { payButtonLabel, payView, priceLabel, type EventPay } from "@/shared/event/payment-label";
import { COLUMN_GAP_PX, VALUE_AXIS_PX } from "@/shared/layout/axes";
import { GoingLine } from "@/shared/event/going-line";
import type { EventInvite } from "@/shared/services/event-invite";
import type { GoingSummary } from "@/shared/services/event-going";
import type { EventRegistration, PortfolioChoice } from "@/shared/services/event-registration";
import { ManageFrame } from "../manage/manage-frame";

const SKY =
  "press inline-block border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] no-underline disabled:opacity-40 [-webkit-tap-highlight-color:transparent]";

export const PAY_PENDING = "Payment pending — the organiser will confirm it";

type EventJoinProps = {
  lookup: string;
  event: EventInvite;
  portfolios: PortfolioChoice[];
  registration: EventRegistration | null;
  pay: EventPay;
  going: GoingSummary | null;
};

/** A card with a name. Untitled and Inactive cards are not offered as a badge. */
function isActive(portfolio: PortfolioChoice): boolean {
  return Boolean(portfolio.name.trim());
}

/** Payment for the guest: price, Pay, the code, I've paid, then the status. */
export function PaymentBlock({
  lookup,
  pay,
  registration,
  onSaid,
}: {
  lookup: string;
  pay: EventPay;
  registration: EventRegistration | null;
  onSaid?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const codeRef = useRef<HTMLSpanElement>(null);
  const price = priceLabel(pay.price, pay.currency);
  const view = payView(registration?.paidStatus ?? "", registration?.paidSource ?? null);
  const confirmed = view.key === "confirmed";
  const pending = !confirmed && (said || view.method === "says paid");

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setNotice("Copied");
    } catch {
      const node = codeRef.current;
      if (!node) return;
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  };

  const sayPaid = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(lookup)}/payments/said`, { method: "POST" });
      if (!response.ok) {
        setError("Could not save that.");
        setBusy(false);
        return;
      }
      setSaid(true);
      setBusy(false);
      if (onSaid) onSaid();
      else router.refresh();
    } catch {
      setError("Could not save that.");
      setBusy(false);
    }
  };

  return (
    <>
      {pay.paymentNote ? (
        <p className="mb-0 t-body text-[var(--ink)]">{price ? `${price} · ${pay.paymentNote}` : pay.paymentNote}</p>
      ) : price ? (
        <p className="mb-0 t-body text-[var(--ink)]">{price}</p>
      ) : null}
      {confirmed || pending ? (
        <p className="mt-3 mb-0 inline-flex items-center gap-2 t-meta text-[var(--ink)]">
          <span aria-hidden className="inline-block size-1.5 shrink-0 rounded-full" style={{ background: view.dot }} />
          {confirmed ? "Confirmed" : PAY_PENDING}
        </p>
      ) : registration ? (
        <>
          {pay.paymentUrl ? (
            <a href={registration.payCode ? payLinkWithCode(pay.paymentUrl, registration.payCode) : pay.paymentUrl} className={`mt-3 ${SKY}`}>
              {payButtonLabel(pay.price, pay.currency)}
            </a>
          ) : null}
          {registration.payCode ? (
            <>
              <p className="mt-4 mb-0 t-label">Your code</p>
              <div className="mt-1 flex items-center gap-3">
                <span
                  ref={codeRef}
                  className="text-[var(--ink)]"
                  style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 26, letterSpacing: "0.06em" }}
                >
                  {registration.payCode}
                </span>
                <button
                  type="button"
                  aria-label="Copy code"
                  onClick={() => void copyCode(registration.payCode!)}
                  className="press border-0 bg-transparent p-0 text-[var(--ink)] [-webkit-tap-highlight-color:transparent]"
                >
                  <Copy size={16} strokeWidth={1.5} />
                </button>
              </div>
              <p className="mt-2 mb-0 t-meta text-[var(--grey)]">
                Add it to the payment comment, so the organiser can confirm your payment.
              </p>
            </>
          ) : null}
          <div>
            <button type="button" disabled={busy} onClick={() => void sayPaid()} className={`mt-4 ${SKY}`}>
              I&apos;ve paid
            </button>
          </div>
        </>
      ) : null}
      {error ? <p className="mt-2 mb-0 t-meta text-[var(--grey)]">{error}</p> : null}
      {notice ? <SkyToast key={notice} text={notice} onDone={() => setNotice(null)} /> : null}
    </>
  );
}

/** The event page of a registered account: poster, payment, the badge card. */
export function EventJoin({ lookup, event, portfolios, registration, pay, going }: EventJoinProps) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(registration?.cardId ?? null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const price = pay.isPaid ? priceLabel(pay.price, pay.currency) : null;
  const poster = {
    name: event.name,
    description: event.description,
    date: event.date,
    endDate: event.endsAt,
    timeZone: event.timeZone,
    place: event.place,
    placeSecret: event.placeSecret,
    logoUrl: event.logoAttachmentId ? `/e/${event.publicToken}/logo` : null,
    price,
    inviteRows: event.inviteRows,
    logoLook: event.logoLook,
  };

  const current = portfolios.find((portfolio) => portfolio.id === selectedId) ?? null;
  const choices = portfolios.filter(isActive);
  const when = eventDayLong(event.date, event.timeZone);
  const goingText = ["You're going", when, event.placeSecret ? null : event.place].filter(Boolean).join(" · ");

  const notGoing = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(lookup)}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not save that.");
        setBusy(false);
        return;
      }
      router.replace("/network/event");
    } catch {
      setError("Could not save that.");
      setBusy(false);
    }
  };

  const choose = async (cardId: string) => {
    if (busy) return;
    setOpen(false);
    if (cardId === selectedId) return;
    const previous = selectedId;
    setBusy(true);
    setError(null);
    setSelectedId(cardId);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(lookup)}/register`, {
        method: registration ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setSelectedId(previous);
        setError(body.error ?? "Could not save.");
        setBusy(false);
        return;
      }
      setBusy(false);
      router.refresh();
    } catch {
      setSelectedId(previous);
      setError("Could not save.");
      setBusy(false);
    }
  };

  return (
    <ManageFrame title={eventTitleLine(event.name)} fallbackHref="/network/event">
      <div className="pt-[18px] pb-[18px]" style={{ marginLeft: VALUE_AXIS_PX }}>
        <CoverButton variant="card" layout={event.layout} themeId={event.theme} event={poster} />
        {going ? (
          <GoingLine
            lookup={lookup}
            going={going.going}
            wereThere={going.wereThere}
            met={going.met}
            ended={false}
            className="mt-4"
          />
        ) : null}
      </div>
      <div className="border-t border-[var(--rule)]">
        {registration ? (
          <Zone label="Going" align="start" rule>
            <p className="m-0 t-body text-[var(--ink)]">{goingText}</p>
            <p className="mt-1 mb-0 t-meta text-[var(--grey)]">Show your card at the door — the QR on Home.</p>
            {registration.paidStatus === "paid" ? null : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void notGoing()}
                className="press mt-3 border-0 bg-transparent p-0 text-left t-meta text-[var(--grey)] [-webkit-tap-highlight-color:transparent]"
              >
                Not going after all
              </button>
            )}
          </Zone>
        ) : null}
        {pay.isPaid ? (
          <Zone label="Payment" align="start" rule>
            <PaymentBlock lookup={lookup} pay={pay} registration={registration} />
          </Zone>
        ) : null}
        <Zone label="Badge" align="start">
          <div className="flex flex-col gap-[18px]">
            {current && !open ? (
              <div className="flex w-full min-w-0 items-center" style={{ gap: COLUMN_GAP_PX }}>
                <PortfolioFace portfolio={current} selected />
                {choices.length > 1 || !isActive(current) ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setOpen(true)}
                    className="press shrink-0 border-0 bg-transparent p-0 t-body text-[var(--ink)] [-webkit-tap-highlight-color:transparent]"
                  >
                    Change ›
                  </button>
                ) : null}
              </div>
            ) : (
              choices.map((portfolio) => (
                <button
                  key={portfolio.id}
                  type="button"
                  aria-pressed={selectedId === portfolio.id}
                  disabled={busy}
                  onClick={() => void choose(portfolio.id)}
                  className="press flex w-full min-w-0 items-center border-0 bg-transparent p-0 text-left [-webkit-tap-highlight-color:transparent]"
                  style={{ gap: COLUMN_GAP_PX }}
                >
                  <PortfolioFace portfolio={portfolio} selected={selectedId === portfolio.id} />
                </button>
              ))
            )}
          </div>
          <p className="mt-4 mb-0 t-meta text-[var(--grey)]">The card you bring — your badge at the door, and what you share.</p>
          {error ? <p className="mt-2 mb-0 t-meta text-[var(--ink)]">{error}</p> : null}
        </Zone>
      </div>
    </ManageFrame>
  );
}
