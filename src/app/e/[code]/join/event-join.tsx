"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BusinessCard } from "@main/components/business-card";
import { BackButton } from "@/shared/components/back-button";
import { ScreenHeader } from "@/shared/components/screen-header";
import { Switch } from "@/shared/components/ui/switch";
import { Zone } from "@/shared/components/zone";
import { InviteQr } from "@/shared/event/invite-qr";
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
    return (
      <main className="compass-main fixed inset-0 overflow-y-auto bg-white">
        <div className="bg-white pt-[84px]" style={{ ["--card-frame-top" as string]: "84px" }}>
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

  return (
    <main className="compass-main fixed inset-0 overflow-y-auto bg-white">
      <ScreenHeader title="Join" fallbackHref={`/e/${encodeURIComponent(lookup)}`} />
      <div className="px-[var(--gutter)]">
        {portfolios.length === 0 ? (
          <p className="mb-0 t-body text-[var(--grey)]">No portfolio yet.</p>
        ) : (
          portfolios.map((portfolio, index) => (
            <Zone key={portfolio.id} label={String(index + 1).padStart(2, "0")} rule={index < portfolios.length - 1}>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void choose(portfolio.id)}
                className="border-0 bg-transparent p-0 text-left t-body text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]"
              >
                {portfolio.name || "Untitled"}
              </button>
            </Zone>
          ))
        )}
        {error ? <p className="mt-4 mb-0 t-meta text-[var(--grey)]">{error}</p> : null}
      </div>
    </main>
  );
}
