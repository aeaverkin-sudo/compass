import type { Metadata } from "next";
import Link from "next/link";
import { EventJoin } from "./join/event-join";
import { CoverButton } from "@/shared/event/cover-button";
import { ScreenHeader } from "@/shared/components/screen-header";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { priceLabel } from "@/shared/event/payment-label";
import { ensurePayCode, loadOwnerEventCounts, loadOwnedBadge, loadOwnRegistration } from "@/shared/services/event-registration";
import { loadEventInvite } from "@/shared/services/event-invite";
import { loadEventPay } from "@/shared/services/event-payment";
import { requestOrigin } from "@/shared/services/public-card-meta";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const event = await loadEventInvite(code);
  return { title: event?.name || "ADED" };
}

export default async function EventInvitePage({ params, searchParams }: PageProps) {
  const { code } = await params;
  const query = await searchParams;
  const from = Array.isArray(query.from) ? query.from[0] : query.from;
  const fromList = from === "events";
  const event = await loadEventInvite(code);
  if (!event) {
    return (
      <main className="compass-main fixed inset-0 overflow-y-auto bg-white text-[var(--ink)]">
        <div className="mx-auto min-h-dvh w-full max-w-[430px] px-[var(--gutter)]">
          <ScreenHeader title="Join" fallbackHref="/network/event" />
          <p className="t-body">Event not found</p>
        </div>
      </main>
    );
  }

  let lookup = code.trim();
  try {
    lookup = decodeURIComponent(lookup);
  } catch {
    lookup = code;
  }
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user ?? null;
  const pay = await loadEventPay(event.id);
  const posterPrice = pay.isPaid ? priceLabel(pay.price, pay.currency) : null;
  if (user) {
    const loaded = await loadOwnRegistration(event.id, user.id);
    const registration = loaded && pay.isPaid ? await ensurePayCode(event.id, user.id, loaded) : loaded;
    const badge = registration ? await loadOwnedBadge(user.id, registration.cardId) : null;
    if (registration && badge) {
      const origin = await requestOrigin();
      return (
        <EventJoin
          lookup={lookup}
          event={event}
          origin={origin}
          portfolios={[]}
          registration={registration}
          badge={badge}
          pay={pay}
        />
      );
    }
  }
  const viewerId = user && !user.is_anonymous ? user.id : null;
  const counts = await loadOwnerEventCounts(event.id, viewerId);

  return (
    <main className="compass-main flex h-dvh w-full flex-col overflow-hidden bg-white text-[var(--ink)]">
      {fromList ? (
        <div
          className="flex shrink-0 items-center px-5"
          style={{ height: "calc(env(safe-area-inset-top) + 44px)", paddingTop: "env(safe-area-inset-top)" }}
        >
          <Link
            href="/network/event"
            className="press t-body text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]"
          >
            ‹ Events
          </Link>
        </div>
      ) : null}
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex w-full max-w-[380px] flex-col items-center">
          <CoverButton
            variant="card"
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
              price: posterPrice,
            }}
          />
          {counts ? (
            <p className="mt-8 mb-0 t-body">{`Registered ${counts.registered} · Checked-in ${counts.checkedIn}`}</p>
          ) : null}
          <Link
            href={`/e/${encodeURIComponent(lookup)}/join`}
            className="press mt-8 inline-block bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]"
          >
            I'm going
          </Link>
        </div>
      </div>
    </main>
  );
}
