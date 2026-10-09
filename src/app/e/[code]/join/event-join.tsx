"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Plus } from "lucide-react";
import { SCREEN_TOP_AXIS_PX } from "@main/layout";
import { NetworkBand } from "@/app/network/network-band";
import { BackButton } from "@/shared/components/back-button";
import { Rule } from "@/shared/components/rule";
import { ScreenHeader } from "@/shared/components/screen-header";
import { SkyToast } from "@/shared/components/sky-toast";
import { Switch } from "@/shared/components/ui/switch";
import { Zone } from "@/shared/components/zone";
import { CoverButton } from "@/shared/event/cover-button";
import { InviteQr } from "@/shared/event/invite-qr";
import { payLinkWithCode } from "@/shared/event/pay-code";
import { payButtonLabel, payView, priceLabel, type EventPay } from "@/shared/event/payment-label";
import { COLUMN_GAP_PX, HEADER_ROW_PX, LABEL_COLUMN_PX, VALUE_AXIS_PX } from "@/shared/layout/axes";
import type { BadgeFace, EventRegistration, PortfolioChoice } from "@/shared/services/event-registration";
import type { EventInvite } from "@/shared/services/event-invite";

type EventJoinProps = {
  lookup: string;
  event: EventInvite;
  origin: string;
  portfolios: PortfolioChoice[];
  registration: EventRegistration | null;
  badge: BadgeFace | null;
  pay: EventPay;
};

export function EventJoin({ lookup, event, origin, portfolios, registration, badge, pay }: EventJoinProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(portfolios[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [consentAnalytics, setConsentAnalytics] = useState(true);
  const [consentConnections, setConsentConnections] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [said, setSaid] = useState(false);
  const codeRef = useRef<HTMLSpanElement>(null);

  const choose = async (cardId: string) => {
    if (busy) return;
    setBusy(cardId);
    setError(null);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(lookup)}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, consentAnalytics, consentConnections }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Could not join");
        setBusy(null);
        return;
      }
      router.refresh();
    } catch {
      setError("Could not join");
      setBusy(null);
    }
  };

  if (registration && badge) {
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

  const joinNext = `/e/${encodeURIComponent(lookup)}/join`;
  const createHref = `/try?next=${encodeURIComponent(joinNext)}&new=1`;

  return (
    <main className="compass-main flex h-dvh flex-col overflow-hidden bg-white text-[var(--ink)]">
      <div className="min-h-0 flex-1 overflow-y-auto px-[var(--gutter)] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <ScreenHeader title="Your badge" fallbackHref={`/e/${encodeURIComponent(lookup)}`} />
        <p className="mb-0 t-meta text-[var(--grey)]">
          Pick the card you bring to {event.name} — your badge at the door, and what you share.
        </p>
        <div
          className="grid items-start pt-[18px]"
          style={{ gridTemplateColumns: `${LABEL_COLUMN_PX}px minmax(0, 1fr)`, columnGap: COLUMN_GAP_PX }}
        >
          <span className="t-label pt-[18px]">Portfolio</span>
          <div className="min-w-0">
            {portfolios.map((portfolio) => {
              const selected = selectedId === portfolio.id;
              return (
                <button
                  key={portfolio.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={busy !== null}
                  onClick={() => setSelectedId(portfolio.id)}
                  className="press flex w-full min-w-0 items-center border-0 bg-transparent px-0 py-[18px] text-left disabled:opacity-40 [-webkit-tap-highlight-color:transparent]"
                  style={{ gap: COLUMN_GAP_PX }}
                >
                  <PortfolioPhoto src={portfolio.photoAttachmentId ? `/f/${portfolio.photoAttachmentId}` : null} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate t-body ${selected ? "text-[var(--ink)]" : "text-[var(--grey)]"}`}>
                      {portfolio.name || "Untitled"}
                    </span>
                    {portfolio.title ? (
                      <span className="mt-1 block truncate t-meta text-[var(--grey)]">{portfolio.title}</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
            <div className="py-[18px]">
              <Link
                href={createHref}
                className="press flex w-full min-w-0 items-center text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]"
                style={{ gap: COLUMN_GAP_PX }}
              >
                <span aria-hidden className="flex w-10 shrink-0 items-center justify-center">
                  <Plus className="size-6 text-[var(--ink)]" strokeWidth={1.5} />
                </span>
                <span className="min-w-0 truncate t-body text-[var(--ink)]">Create new</span>
              </Link>
            </div>
          </div>
        </div>
        <Rule />
        <div
          className="grid items-start py-[18px]"
          style={{ gridTemplateColumns: `${LABEL_COLUMN_PX}px minmax(0, 1fr)`, columnGap: COLUMN_GAP_PX }}
        >
          <span className="t-label">Sharing</span>
          <div className="flex min-w-0 flex-col gap-5">
            <div className="flex items-start" style={{ gap: COLUMN_GAP_PX }}>
              <span className="flex w-10 shrink-0">
                <Switch
                  checked={consentAnalytics}
                  onCheckedChange={setConsentAnalytics}
                  aria-labelledby="join-consent-analytics"
                />
              </span>
              <span className="min-w-0">
                <span id="join-consent-analytics" className="block t-body text-[var(--ink)]">
                  Share anonymous analytics
                </span>
                <span className="mt-1 block t-meta text-[var(--grey)]">
                  Nobody sees your personal details — only an anonymous business summary.
                </span>
              </span>
            </div>
            <div className="flex items-start" style={{ gap: COLUMN_GAP_PX }}>
              <span className="flex w-10 shrink-0">
                <Switch
                  checked={consentConnections}
                  onCheckedChange={setConsentConnections}
                  aria-labelledby="join-consent-connections"
                />
              </span>
              <span className="min-w-0">
                <span id="join-consent-connections" className="block t-body text-[var(--ink)]">
                  Allow connections
                </span>
                <span className="mt-1 block t-meta text-[var(--grey)]">
                  Your summary can be matched to the right people — say, an investor you're looking for.
                </span>
              </span>
            </div>
          </div>
        </div>
        {portfolios.length > 0 ? (
          <div className="pb-[18px]" style={{ marginLeft: VALUE_AXIS_PX }}>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                if (selectedId) void choose(selectedId);
              }}
              className="press border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]"
            >
              I'm going →
            </button>
          </div>
        ) : null}
        {error ? <p className="mb-0 t-meta text-[var(--grey)]">{error}</p> : null}
      </div>
      <NetworkBand current="event" />
    </main>
  );
}

function PortfolioPhoto({ src }: { src: string | null }) {
  if (!src) return <span aria-hidden className="size-[40px] shrink-0 bg-[#f3f3f3]" />;
  return <img src={src} alt="" className="size-[40px] shrink-0 object-cover" />;
}
