import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { ScreenHeader } from "@/shared/components/screen-header";
import { loadEventInvite } from "@/shared/services/event-invite";
import { ensurePayCode, listOwnPortfolios, loadOwnRegistration } from "@/shared/services/event-registration";
import { priceLabel } from "@/shared/event/payment-label";
import { loadEventPay } from "@/shared/services/event-payment";
import { namedPassIds } from "@/shared/services/event-open-link";
import { eventHasEnded } from "@/shared/services/events";
import { holdsEventPass, isPermanentAccount, mayJoinWithoutLink } from "@/shared/services/guest-accept";
import { EventJoin } from "./event-join";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ code: string }> };

export const metadata: Metadata = { title: "Join" };

/** The event page of a registered account, with or without a registration. A pass lives on the main screen. */
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
  const invite = `/e/${encodeURIComponent(lookup)}`;
  if (eventHasEnded(event.date, event.endsAt)) redirect(invite);
  const session = user ? { id: user.id, anonymous: Boolean(user.is_anonymous) } : null;
  if (!user || !(await isPermanentAccount(session))) {
    redirect((await holdsEventPass(session, event.id)) ? "/main" : invite);
  }

  const loaded = await loadOwnRegistration(event.id, user.id);
  if (!loaded && !(await mayJoinWithoutLink(event.id, user.id))) redirect(invite);
  const pay = await loadEventPay(event.id);
  if (!loaded || !(await namedPassIds([loaded.id])).has(loaded.id)) {
    return <EventJoin mode="poster" event={event} price={pay.isPaid ? priceLabel(pay.price, pay.currency) : null} />;
  }
  const registration = pay.isPaid ? await ensurePayCode(event.id, user.id, loaded) : loaded;
  const portfolios = await listOwnPortfolios(user.id);
  return (
    <EventJoin
      key={`${registration.id}:${registration.cardId}`}
      lookup={lookup}
      event={event}
      portfolios={portfolios}
      registration={registration}
      pay={pay}
    />
  );
}
