import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { listEventGuests, loadManageEvent } from "@/shared/services/event-manage";
import { loadGuestBook, registrationGuest } from "@/shared/services/event-guest-lists";
import { loadEventInvite } from "@/shared/services/event-invite";
import { requestOrigin } from "@/shared/services/public-card-meta";
import { eventPublicPath } from "@/shared/event/slug";
import { GuestsScreen } from "./guests-screen";
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
  const [list, invite, origin] = await Promise.all([listEventGuests(event.id), loadEventInvite(lookup), requestOrigin()]);
  const book = await loadGuestBook(event.id, list.guests).catch((error) => {
    console.error("[events] guest book", error);
    return null;
  });
  const shareKey = invite?.slug?.trim() || invite?.code.trim() || event.publicToken;

  return (
    <GuestsScreen
      lookup={lookup}
      name={eventTitleLine(event.name)}
      guests={book ? book.guests : list.guests.map(registrationGuest)}
      lists={book ? book.lists.map((item) => ({ id: item.id, name: item.name, count: item.total })) : null}
      initialList={typeof query.list === "string" ? query.list : null}
      inviteUrl={`${origin}${eventPublicPath(shareKey)}`}
      canMark={event.role === "owner" || event.permissions.payments}
      isPaid={event.isPaid}
      timeZone={event.timeZone}
    />
  );
}
