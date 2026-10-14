import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { priceLabel } from "@/shared/event/payment-label";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { requestOrigin } from "@/shared/services/public-card-meta";
import { listEventManagers, loadManageEvent, managerCap, visibleSections } from "@/shared/services/event-manage";
import { loadEventInvite } from "@/shared/services/event-invite";
import { loadEventPay, loadPaymentTally } from "@/shared/services/event-payment";
import { loadGuestBook } from "@/shared/services/event-guest-lists";
import { loadShowGoing } from "@/shared/services/event-going";
import { eventPublicPath } from "@/shared/event/slug";
import { eventDayLong, formatEventWhen } from "@/shared/event/when";
import { eventDoorIsOpen, eventHasEnded } from "@/shared/services/events";
import { loadOpenLink } from "@/shared/services/event-open-link";
import { countCardsExchanged } from "@/shared/services/event-export";
import { eventMailsReady, loadReminder } from "@/shared/services/event-mails";
import { isGoing } from "@/shared/event/guest-book";
import { guestSources, isPaidGuest, isPendingGuest } from "@/shared/event/guest-sources";
import { loadPosterPath } from "@/shared/services/poster-snapshot";
import { ManageHome } from "./manage-home";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Event" };

type PageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ created?: string; saved?: string }>;
};

function once(value: string): string {
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}

export default async function ManageEventPage({ params, searchParams }: PageProps) {
  const { code } = await params;
  const query = await searchParams;
  const lookup = once(code);
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) notFound();
  const access = await loadManageEvent(lookup, data.user.id);
  if (access.kind !== "ok") notFound();

  const event = access.event;
  const sections = visibleSections(event.role, event.permissions);
  const invite = await loadEventInvite(lookup);
  if (!invite) notFound();
  const pay = await loadEventPay(event.id);
  const ended = eventHasEnded(invite.date, invite.endsAt);
  const [managers, tally, book, showGoing, openLink, cards, mailReady, reminder, posterPath] = await Promise.all([
    sections.includes("managers") ? listEventManagers(event.id) : Promise.resolve(null),
    sections.includes("payment") ? loadPaymentTally(event.id) : Promise.resolve(null),
    sections.includes("guests")
      ? loadGuestBook(event.id).catch((error) => {
          console.error("[events] guest book", error);
          return null;
        })
      : Promise.resolve(null),
    sections.includes("guests") ? loadShowGoing(event.id) : Promise.resolve(true),
    loadOpenLink(event.id),
    ended ? countCardsExchanged(event.id) : Promise.resolve(0),
    sections.includes("guests") ? eventMailsReady() : Promise.resolve(false),
    sections.includes("guests") ? loadReminder(event.id) : Promise.resolve({ ready: false, enabled: false, sentAt: null }),
    sections.includes("guests") ? loadPosterPath(event.id) : Promise.resolve(null),
  ]);
  const origin = await requestOrigin();
  const flash = query.created === "1" ? "created" : query.saved === "1" ? "saved" : null;
  const shareKey = invite.slug?.trim() || invite.code.trim() || event.publicToken;
  const endedLabel = ended ? (formatEventWhen(invite.endsAt ?? invite.date, invite.timeZone) ?? "") : null;
  const doorOpen = eventDoorIsOpen(invite.date, invite.endsAt);

  const guests = book?.guests ?? [];
  const lists = book?.lists ?? [];
  const total = book ? book.total : event.registered;
  const going = book ? book.going : event.registered;
  const checkedIn = book ? book.checkedIn : event.checkedIn;
  const paid = book ? guests.filter(isPaidGuest).length : event.paid;
  const pending = book ? guests.filter(isPendingGuest).length : Math.max(0, event.registered - event.paid);
  const counter = [String(total), `${going} going`, ...(pay.isPaid ? [`${paid} paid`] : []), `${checkedIn} in`].join(" · ");
  const listed = guests.filter((guest) => guest.guestId && guest.sent);
  const withEmail = guests.filter((guest) => guest.guestId && guest.email);
  const pendingMail = withEmail.filter((guest) => !guest.sent && !guest.bounced && !guest.unsubscribed).length;

  return (
    <ManageHome
      lookup={lookup}
      name={event.name}
      shareUrl={`${origin}${eventPublicPath(shareKey)}`}
      sections={sections}
      canEdit={event.role === "owner" || event.permissions.edit}
      canDelete={event.role === "owner"}
      flash={flash}
      cover={{
        description: invite.description,
        date: invite.date,
        endsAt: invite.endsAt,
        timeZone: invite.timeZone,
        place: invite.place,
        placeSecret: invite.placeSecret,
        theme: invite.theme,
        layout: invite.layout,
        inviteRows: invite.inviteRows,
        logoLook: invite.logoLook,
        logoUrl: invite.logoAttachmentId ? `/e/${event.publicToken}/logo` : null,
        price: pay.isPaid ? priceLabel(pay.price, pay.currency) : null,
      }}
      pay={sections.includes("payment") ? pay : null}
      tally={tally}
      managers={managers ?? []}
      canRemove={event.role === "owner"}
      teamFull={(managers?.length ?? event.managers) >= managerCap()}
      endedLabel={endedLabel}
      doorOpen={doorOpen}
      showGoing={showGoing}
      afishaHref={posterPath ? `/api/events/${encodeURIComponent(lookup)}/afisha` : null}
      openLink={{ open: openLink.open, capacity: openLink.capacity, joined: event.registered }}
      guests={{
        counter,
        checkedIn,
        sources: book ? guestSources(guests, lists) : [],
        pairs: book?.pairs ?? [],
        passes: book?.passes ?? [],
        sent: {
          sent: listed.length,
          opened: listed.filter((guest) => guest.opened || isGoing(guest.status)).length,
          going: listed.filter((guest) => isGoing(guest.status)).length,
        },
        mail: { ready: mailReady, pending: pendingMail, withEmail: withEmail.length },
        reminder: {
          ready: reminder.ready && mailReady,
          enabled: reminder.enabled,
          sentLabel: reminder.sentAt ? (eventDayLong(reminder.sentAt, invite.timeZone) ?? null) : null,
        },
      }}
      after={ended ? { came: checkedIn, total, cards, paid: pay.isPaid ? { paid, pending } : null } : null}
    />
  );
}
