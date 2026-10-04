import type { Metadata } from "next";
import { isEventJoinPath } from "@/shared/event/lookup";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { ScreenHeader } from "@/shared/components/screen-header";
import { loadEventInvite } from "@/shared/services/event-invite";
import { requestOrigin } from "@/shared/services/public-card-meta";
import { listOwnPortfolios, loadOwnRegistration, loadOwnedBadge } from "@/shared/services/event-registration";
import { EventGate } from "./event-gate";
import { EventJoin } from "./event-join";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ code: string }> };

export const metadata: Metadata = { title: "Join" };

export default async function EventJoinPage({ params }: PageProps) {
  const { code } = await params;
  const event = await loadEventInvite(code);
  if (!event) {
    return (
      <main className="compass-main fixed inset-0 overflow-y-auto bg-white">
        <ScreenHeader title="Join" fallbackHref="/network/event" />
        <div className="px-[var(--gutter)]">
          <p className="mb-0 t-body text-[var(--grey)]">Event not found</p>
        </div>
      </main>
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user && !data.user.is_anonymous ? data.user : null;
  let lookup = code.trim();
  try {
    lookup = decodeURIComponent(lookup);
  } catch {
    // A broken escape stays as written.
  }
  const next = `/e/${encodeURIComponent(lookup)}/join`;
  if (!user) {
    return (
      <EventGate
        name={event.name}
        next={isEventJoinPath(next) ? next : "/main"}
        inviteHref={`/e/${encodeURIComponent(lookup)}`}
      />
    );
  }

  const registration = await loadOwnRegistration(event.id, user.id);
  const badge = registration ? await loadOwnedBadge(user.id, registration.cardId) : null;
  if (registration && !badge) {
    return (
      <main className="compass-main fixed inset-0 overflow-y-auto bg-white">
        <ScreenHeader title="Join" fallbackHref={`/e/${encodeURIComponent(lookup)}`} />
        <div className="px-[var(--gutter)]">
          <p className="mb-0 t-body text-[var(--grey)]">That portfolio is no longer available.</p>
        </div>
      </main>
    );
  }
  const portfolios = registration ? [] : await listOwnPortfolios(user.id);
  const origin = await requestOrigin();

  return (
    <EventJoin
      key={registration?.id ?? "pick"}
      lookup={lookup}
      event={event}
      origin={origin}
      portfolios={portfolios}
      registration={badge ? registration : null}
      badge={badge}
    />
  );
}
