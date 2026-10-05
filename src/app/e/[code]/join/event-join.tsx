"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
