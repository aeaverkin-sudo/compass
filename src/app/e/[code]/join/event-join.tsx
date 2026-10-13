"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { SCREEN_TOP_AXIS_PX } from "@main/layout";
import { NetworkBand } from "@/app/network/network-band";
import { BackButton } from "@/shared/components/back-button";
import { SkyToast } from "@/shared/components/sky-toast";
import { Zone } from "@/shared/components/zone";
import { CoverButton } from "@/shared/event/cover-button";
import { InviteQr } from "@/shared/event/invite-qr";
import { payLinkWithCode } from "@/shared/event/pay-code";
import { payButtonLabel, payView, priceLabel, type EventPay } from "@/shared/event/payment-label";
import { HEADER_ROW_PX } from "@/shared/layout/axes";
import type { BadgeFace, EventRegistration } from "@/shared/services/event-registration";
import type { EventInvite } from "@/shared/services/event-invite";

type EventJoinProps = {
  lookup: string;
  event: EventInvite;
  origin: string;
  registration: EventRegistration;
  badge: BadgeFace;
  pay: EventPay;
};

export function EventJoin({ lookup, event, origin, registration, pay }: EventJoinProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [said, setSaid] = useState(false);
  const codeRef = useRef<HTMLSpanElement>(null);

  {
    const checkIn = `${origin}/e/${encodeURIComponent(event.code)}/b/${registration.regToken}`;
    const headerTop = `calc(env(safe-area-inset-top) + ${SCREEN_TOP_AXIS_PX}px - ${HEADER_ROW_PX / 2}px)`;
    const view = payView(registration.paidStatus ?? "", registration.paidSource);
    const price = pay.isPaid ? priceLabel(pay.price, pay.currency) : null;
    const poster = {
      name: event.name,
      description: event.description,
      date: event.date,
      endDate: event.endsAt,
      place: event.place,
      placeSecret: event.placeSecret,
      logoUrl: event.logoAttachmentId ? `/e/${event.publicToken}/logo` : null,
      price,
      inviteRows: event.inviteRows,
      logoLook: event.logoLook,
    };

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
      setBusy("paid");
      setError(null);
      try {
        const response = await fetch(`/api/events/${encodeURIComponent(lookup)}/payments/said`, { method: "POST" });
        if (!response.ok) {
          setError("Could not save that.");
          setBusy(null);
          return;
        }
        setSaid(true);
        setBusy(null);
        router.refresh();
      } catch {
        setError("Could not save that.");
        setBusy(null);
      }
    };

    return (
      <main className="compass-main flex h-dvh flex-col overflow-hidden bg-white text-[var(--ink)]">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-[var(--gutter)]">
          <BackButton fallbackHref={`/e/${encodeURIComponent(lookup)}`} />
          <h1
            className="pointer-events-none fixed inset-x-0 z-20 m-0 flex items-center justify-center t-caps text-[var(--ink)]"
            style={{ top: headerTop, height: HEADER_ROW_PX }}
          >
            You're going
          </h1>
          <div aria-hidden className="shrink-0" style={{ height: `calc(${headerTop} + ${HEADER_ROW_PX}px)` }} />
          {pay.isPaid ? (
            <Zone label="Payment" align="start">
              {pay.paymentNote ? (
                <p className="mb-0 t-body text-[var(--ink)]">{price ? `${price} · ${pay.paymentNote}` : pay.paymentNote}</p>
              ) : price ? (
                <p className="mb-0 t-body text-[var(--ink)]">{price}</p>
              ) : null}
              {pay.paymentUrl ? (
                <a
                  href={registration.payCode ? payLinkWithCode(pay.paymentUrl, registration.payCode) : pay.paymentUrl}
                  className="press mt-3 inline-block border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]"
                >
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
              {view.key === "confirmed" ? (
                <p className="mt-4 mb-0 inline-flex items-center gap-2 t-body text-[var(--ink)]">
                  <span aria-hidden className="inline-block size-1.5 rounded-full" style={{ background: view.dot }} />
                  {view.long}
                </p>
              ) : said || view.method === "says paid" ? (
                <p className="mt-4 mb-0 t-meta text-[var(--grey)]">
                  <span className="inline-flex items-center gap-2">
                    <span aria-hidden className="inline-block size-1.5 rounded-full" style={{ background: view.dot }} />
                    {said
                      ? "Thanks — the organiser will confirm your payment."
                      : "Payment not confirmed yet — the organiser will confirm it."}
                  </span>
                </p>
              ) : (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void sayPaid()}
                  className="press mt-4 border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]"
                >
                  I&apos;ve paid
                </button>
              )}
            </Zone>
          ) : null}
          <div className="mt-2 flex flex-col items-center">
            <p className="mb-3 t-caps text-[var(--grey)]">Check-in</p>
            <InviteQr url={checkIn} size={220} />
            <p className="mt-4 mb-0 max-w-[280px] text-center t-meta text-[var(--grey)]">
              Show this at the door. Unconfirmed payments may be checked at the entrance.
            </p>
          </div>
          {error ? <p className="mb-0 t-meta text-[var(--grey)]">{error}</p> : null}
          <div
            className="mt-4 flex min-h-0 w-full flex-1 items-center justify-center pb-4"
            style={{ containerType: "size" }}
          >
            <div style={{ width: "min(100cqw, calc(100cqh * 286 / 404))" }}>
              <CoverButton variant="square" layout={event.layout} themeId={event.theme} event={poster} />
            </div>
          </div>
        </div>
        <NetworkBand current="event" />
        {notice ? <SkyToast key={notice} text={notice} onDone={() => setNotice(null)} /> : null}
      </main>
    );
  }

}
