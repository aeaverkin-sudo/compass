import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isEventJoinPath } from "@/shared/event/lookup";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { ScreenHeader } from "@/shared/components/screen-header";
import { loadEventInvite } from "@/shared/services/event-invite";
import { requestOrigin } from "@/shared/services/public-card-meta";
import { ensurePayCode, listOwnPortfolios, loadOwnRegistration, loadOwnedBadge } from "@/shared/services/event-registration";
import { loadEventPay } from "@/shared/services/event-payment";
import { eventListStatus } from "@/shared/services/events";
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
  const user = data.user ?? null;
  let lookup = code.trim();
  try {
    lookup = decodeURIComponent(lookup);
  } catch {
    // A broken escape stays as written.
  }
  if (eventListStatus(event.date, Date.now(), event.endsAt) === "past") {
    redirect(`/e/${encodeURIComponent(lookup)}`);
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

  const pay = await loadEventPay(event.id);
  const loaded = await loadOwnRegistration(event.id, user.id);
  const registration = loaded && pay.isPaid ? await ensurePayCode(event.id, user.id, loaded) : loaded;
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
  if (user.is_anonymous && !registration && portfolios.length === 0) {
    redirect(`/try?next=${encodeURIComponent(next)}`);
  }
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
      pay={pay}
    />
  );
}
