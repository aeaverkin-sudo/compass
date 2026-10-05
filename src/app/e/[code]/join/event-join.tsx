"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { SCREEN_TOP_AXIS_PX } from "@main/layout";
import { NetworkBand } from "@/app/network/network-band";
import { BackButton } from "@/shared/components/back-button";
import { Rule } from "@/shared/components/rule";
import { ScreenHeader } from "@/shared/components/screen-header";
import { Switch } from "@/shared/components/ui/switch";
import { InviteCover } from "@/shared/event/invite-cover";
import { InviteQr } from "@/shared/event/invite-qr";
import { payButtonLabel, type EventPay } from "@/shared/event/payment-label";
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consentAnalytics, setConsentAnalytics] = useState(true);
  const [consentConnections, setConsentConnections] = useState(true);

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
    const blocked = pay.isPaid && pay.badgeGate && registration.paidStatus !== "paid";
    const checkIn = `${origin}/e/${encodeURIComponent(event.code)}/b/${registration.regToken}`;
    const headerTop = `calc(env(safe-area-inset-top) + ${SCREEN_TOP_AXIS_PX}px - ${HEADER_ROW_PX / 2}px)`;
    return (
      <main className="compass-main flex h-dvh flex-col overflow-hidden bg-white text-[var(--ink)]">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-[var(--gutter)]">
          <BackButton fallbackHref={`/e/${encodeURIComponent(lookup)}`} />
          <h1
            className="pointer-events-none fixed inset-x-0 z-20 m-0 flex items-center justify-center t-caps text-[var(--ink)]"
            style={{ top: headerTop, height: HEADER_ROW_PX }}
          >
            You're going
          </h1>
          <div aria-hidden className="shrink-0" style={{ height: `calc(${headerTop} + ${HEADER_ROW_PX}px)` }} />
          {blocked ? (
            <div className="flex shrink-0 flex-col items-center pt-4 text-center">
              <p className="mb-0 t-caps">Payment required</p>
              {pay.paymentUrl ? (
                <a
                  href={pay.paymentUrl}
                  className="press mt-4 border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]"
                >
                  {payButtonLabel(pay.price, pay.currency)}
                </a>
              ) : null}
              <p className="mt-4 mb-0 t-meta text-[var(--grey)]">Your badge activates once payment is confirmed</p>
            </div>
          ) : (
            <div className="flex shrink-0 flex-col items-center pt-4">
              <InviteQr url={checkIn} size={220} />
              <p className="mt-4 mb-0 t-caps">Check-in</p>
              <p className="mt-1 mb-0 t-meta text-[var(--grey)]">Show this at the door</p>
            </div>
          )}
          <div
            className="flex min-h-0 w-full flex-1 items-center justify-center py-4"
            style={{ containerType: "size" }}
          >
            <div style={{ width: "min(100cqw, calc(100cqh * 286 / 404))" }}>
              <InviteCover
                  variant="square"
                  layout={event.layout}
                  themeId={event.theme}
                  event={{
                    name: event.name,
                    description: event.description,
                    date: event.date,
                    endDate: event.endsAt,
                    place: event.place,
                    placeSecret: event.placeSecret,
                    logoUrl: event.logoAttachmentId ? `/e/${event.publicToken}/logo` : null,
                  }}
                />
            </div>
          </div>
        </div>
        <NetworkBand current="event" />
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
        <div className="pb-[18px]" style={{ marginLeft: VALUE_AXIS_PX }}>
          <button
            type="button"
            disabled={!selectedId || busy !== null}
            onClick={() => {
              if (selectedId) void choose(selectedId);
            }}
            className="press border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]"
          >
            I'm going →
          </button>
        </div>
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
