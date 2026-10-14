import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { priceLabel } from "@/shared/event/payment-label";
import { staffRole } from "@/shared/event/permissions";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { listEventManagers, loadManageEvent, visibleSections } from "@/shared/services/event-manage";
import { loadEventInvite } from "@/shared/services/event-invite";
import { loadEventPay } from "@/shared/services/event-payment";
import { loadGuestBook } from "@/shared/services/event-guest-lists";
import { eventClock } from "@/shared/event/when";
import { eventDoorIsOpen, eventHasEnded } from "@/shared/services/events";
import { isPaidGuest, isPendingGuest } from "@/shared/event/guest-sources";
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
  const shown = (section: (typeof sections)[number]) => sections.includes(section);
  const canEdit = event.role === "owner" || event.permissions.edit;
  const invite = await loadEventInvite(lookup);
  if (!invite) notFound();
  const pay = await loadEventPay(event.id);
  const ended = eventHasEnded(invite.date, invite.endsAt);
  const needBook = shown("guests") || shown("payment") || shown("analytics");
  const [managers, book] = await Promise.all([
    shown("managers") ? listEventManagers(event.id) : Promise.resolve(null),
    needBook
      ? loadGuestBook(event.id).catch((error) => {
          console.error("[events] guest book", error);
          return null;
        })
      : Promise.resolve(null),
  ]);
  const flash = query.created === "1" ? "created" : query.saved === "1" ? "saved" : null;
  const today = eventDoorIsOpen(invite.date, invite.endsAt) && !ended;
  const door = !canEdit && sections.length === 1 && shown("checkin");

  const guests = book?.guests ?? [];
  const total = book ? book.total : event.registered;
  const going = book ? book.going : event.registered;
  const checkedIn = book ? book.checkedIn : event.checkedIn;
  const paid = book ? guests.filter(isPaidGuest).length : event.paid;
  const pending = book ? guests.filter(isPendingGuest).length : Math.max(0, event.registered - event.paid);
  const sent = guests.filter((guest) => guest.guestId && guest.sent).length;

  return (
    <ManageHome
      lookup={lookup}
      name={event.name}
      canEdit={canEdit}
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
      scanner={shown("checkin") && !ended && (today || door)}
      rooms={{
        event: today && !door ? ["Today", eventClock(invite.date, invite.timeZone), invite.place?.trim()].filter(Boolean).join(" · ") : null,
        payment: shown("payment")
          ? { isPaid: pay.isPaid, price: priceLabel(pay.price, pay.currency), confirmed: paid, pending }
          : null,
        guests: shown("guests") ? { sent, confirmed: pay.isPaid ? paid : going } : null,
        staff: managers
          ? managers.map((manager) => ({ id: manager.userId, name: manager.name, role: staffRole(manager.permissions) }))
          : null,
        stats: shown("analytics") ? { after: ended ? { came: checkedIn, total } : null } : null,
      }}
    />
  );
}
