"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { BusinessCard } from "@main/components/business-card";
import { browseCardHeight, SCREEN_TOP_AXIS_PX } from "@main/layout";
import { NetworkBand } from "@/app/network/network-band";
import { BackButton } from "@/shared/components/back-button";
import { Rule } from "@/shared/components/rule";
import { ScreenHeader } from "@/shared/components/screen-header";
import { Switch } from "@/shared/components/ui/switch";
import { InviteQr } from "@/shared/event/invite-qr";
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
};

export function EventJoin({ lookup, event, origin, portfolios, registration, badge }: EventJoinProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState(registration?.consentAnalytics ?? false);
  const [connections, setConnections] = useState(registration?.consentConnections ?? false);

  const choose = async (cardId: string) => {
    if (busy) return;
    setBusy(cardId);
    setError(null);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(lookup)}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId }),
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

  const saveConsent = async (next: { analytics: boolean; connections: boolean }) => {
    const previous = { analytics, connections };
    setAnalytics(next.analytics);
    setConnections(next.connections);
    setError(null);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(lookup)}/register`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) {
        setAnalytics(previous.analytics);
        setConnections(previous.connections);
        setError("Could not save");
      }
    } catch {
      setAnalytics(previous.analytics);
      setConnections(previous.connections);
      setError("Could not save");
    }
  };

  if (registration && badge) {
    const checkIn = `${origin}/e/${encodeURIComponent(event.code)}/b/${registration.regToken}`;
    const headerTop = `calc(env(safe-area-inset-top) + ${SCREEN_TOP_AXIS_PX}px - ${HEADER_ROW_PX / 2}px)`;
    const cardTop = `calc(${headerTop} + ${HEADER_ROW_PX}px + 18px)`;
    return (
      <main className="compass-main fixed inset-0 overflow-y-auto bg-white">
        <p
          className="pointer-events-none fixed z-20 m-0 flex items-center t-meta text-[var(--grey)]"
          style={{
            top: headerTop,
            left: `calc(var(--gutter) + ${VALUE_AXIS_PX}px)`,
            height: HEADER_ROW_PX,
          }}
        >
          You're going
        </p>
        <div
          className="bg-white"
          style={{
            paddingTop: cardTop,
            ["--card-frame-top" as string]: `calc(100svh - (${browseCardHeight()}))`,
          }}
        >
          <BackButton fallbackHref={`/e/${encodeURIComponent(lookup)}`} />
          <BusinessCard card={badge.card} library={badge.items} mode="browse" readOnly />
        </div>
        <div className="bg-white px-[var(--gutter)] pt-10 pb-16">
          <InviteQr url={checkIn} />
          <p className="mt-4 mb-0 t-meta text-[var(--grey)]">Check-in</p>
          <div className="mt-8 flex items-center justify-between gap-4">
            <span className="t-body" id="consent-analytics">
              Share anonymous analytics
            </span>
            <Switch
              checked={analytics}
              onCheckedChange={(checked) => void saveConsent({ analytics: checked, connections })}
              aria-labelledby="consent-analytics"
            />
          </div>
          <div className="mt-4 flex items-center justify-between gap-4">
            <span className="t-body" id="consent-connections">
              Allow connections
            </span>
            <Switch
              checked={connections}
              onCheckedChange={(checked) => void saveConsent({ analytics, connections: checked })}
              aria-labelledby="consent-connections"
            />
          </div>
          {error ? <p className="mt-4 mb-0 t-meta text-[var(--grey)]">{error}</p> : null}
        </div>
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
        <div className="pt-[18px]">
          {portfolios.map((portfolio, index) => (
            <PickerRow key={portfolio.id} label={index === 0} rule={index > 0}>
              <button
                type="button"
                aria-pressed={selectedId === portfolio.id}
                disabled={busy !== null}
                onClick={() => setSelectedId(portfolio.id)}
                className="flex w-full min-w-0 items-center gap-4 border-0 bg-transparent p-0 text-left text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]"
              >
                <PortfolioPhoto src={portfolio.photoAttachmentId ? `/f/${portfolio.photoAttachmentId}` : null} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate t-name">{portfolio.name || "Untitled"}</span>
                  {portfolio.title ? (
                    <span className="mt-1 block truncate t-meta text-[var(--grey)]">{portfolio.title}</span>
                  ) : null}
                </span>
                <span
                  aria-hidden
                  className={
                    selectedId === portfolio.id
                      ? "flex size-[22px] shrink-0 items-center justify-center rounded-full bg-sky text-[var(--ink)]"
                      : "size-[22px] shrink-0"
                  }
                >
                  {selectedId === portfolio.id ? <Check className="size-3.5" strokeWidth={2.5} /> : null}
                </span>
              </button>
            </PickerRow>
          ))}
          <PickerRow label={portfolios.length === 0} rule={portfolios.length > 0}>
            <Link
              href={createHref}
              className="flex w-full min-w-0 items-center gap-4 text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]"
            >
              <span aria-hidden className="flex size-[56px] shrink-0 items-center justify-center bg-[#f3f3f3]">
                <Plus className="size-6" strokeWidth={1.5} />
              </span>
              <span className="min-w-0 truncate t-name">New card for this event</span>
            </Link>
          </PickerRow>
        </div>
        {error ? <p className="mb-0 t-meta text-[var(--grey)]">{error}</p> : null}
      </div>
      <div className="shrink-0 px-[var(--gutter)] pt-3 pb-4">
        <button
          type="button"
          disabled={!selectedId || busy !== null}
          onClick={() => {
            if (selectedId) void choose(selectedId);
          }}
          className="border-0 bg-[var(--ink)] px-[21.6px] py-[10.8px] t-caps text-white disabled:opacity-40 [-webkit-tap-highlight-color:transparent]"
        >
          I'm going →
        </button>
      </div>
      <NetworkBand current="event" />
    </main>
  );
}

function PickerRow({ label, rule, children }: { label: boolean; rule: boolean; children: ReactNode }) {
  return (
    <div>
      {rule ? <Rule /> : null}
      <div
        className="grid items-start py-[18px]"
        style={{ gridTemplateColumns: `${LABEL_COLUMN_PX}px minmax(0, 1fr)`, columnGap: COLUMN_GAP_PX }}
      >
        <span className="t-label whitespace-nowrap">{label ? "Portfolios" : ""}</span>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

function PortfolioPhoto({ src }: { src: string | null }) {
  if (!src) return <span aria-hidden className="size-[56px] shrink-0 bg-[#f3f3f3]" />;
  return <img src={src} alt="" className="size-[56px] shrink-0 object-cover" />;
}
