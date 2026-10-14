import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { listEventGuests, loadManageEvent } from "@/shared/services/event-manage";
import { loadGuestBook, registrationGuest } from "@/shared/services/event-guest-lists";
import { loadEventInvite } from "@/shared/services/event-invite";
import { loadOpenLink } from "@/shared/services/event-open-link";
import { eventMailsReady, inviteMail, loadMailEvent, loadReminder } from "@/shared/services/event-mails";
import { requestOrigin } from "@/shared/services/public-card-meta";
import { eventPublicPath } from "@/shared/event/slug";
import { eventDayLong } from "@/shared/event/when";
import { GuestsScreen } from "./guests-screen";
import { MAIL_WIDTH } from "./mail-width";
import { eventTitleLine } from "@/shared/event/event-title";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Guests" };

type PageProps = { params: Promise<{ code: string }>; searchParams: Promise<{ list?: string }> };

function once(value: string): string {
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}

export default async function ManageGuestsPage({ params, searchParams }: PageProps) {
  const { code } = await params;
  const query = await searchParams;
  const lookup = once(code);
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) notFound();
  const access = await loadManageEvent(lookup, data.user.id, "guests");
  if (access.kind !== "ok") notFound();
  const event = access.event;
  const [list, invite, origin, openLink, mailReady, reminder, mailEvent] = await Promise.all([
    listEventGuests(event.id),
    loadEventInvite(lookup),
    requestOrigin(),
    loadOpenLink(event.id),
    eventMailsReady(),
    loadReminder(event.id),
    loadMailEvent(lookup),
  ]);
  const book = await loadGuestBook(event.id, list.guests).catch((error) => {
    console.error("[events] guest book", error);
    return null;
  });
  const shareKey = invite?.slug?.trim() || invite?.code.trim() || event.publicToken;
  const guests = book ? book.guests : list.guests.map(registrationGuest);
  const sample = guests.find((guest) => guest.guestId && guest.email && guest.token && !guest.sent) ?? guests.find((guest) => guest.token);
  const preview =
    mailEvent && sample?.token
      ? inviteMail(origin, mailEvent, { name: sample.name, token: sample.token }, { width: MAIL_WIDTH, outer: { y: 0, x: 0 }, posterWidth: 160 }).body
      : null;

  return (
    <GuestsScreen
      lookup={lookup}
      name={eventTitleLine(event.name)}
      guests={guests}
      lists={book ? book.lists : null}
      initialList={typeof query.list === "string" ? query.list : null}
      inviteUrl={`${origin}${eventPublicPath(shareKey)}`}
      isPaid={event.isPaid}
      pairs={book?.pairs ?? []}
      passes={book?.passes ?? []}
      openLink={{ open: openLink.open, capacity: openLink.capacity, joined: event.registered }}
      mail={{ ready: mailReady, preview }}
      reminder={{
        ready: reminder.ready && mailReady,
        enabled: reminder.enabled,
        sentLabel: reminder.sentAt ? (eventDayLong(reminder.sentAt, invite?.timeZone) ?? null) : null,
      }}
    />
  );
}
