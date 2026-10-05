import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatEventRange } from "@/shared/event/when";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { requestOrigin } from "@/shared/services/public-card-meta";
import { loadManageEvent, managerCap, visibleSections } from "@/shared/services/event-manage";
import { ManageHome } from "./manage-home";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Event" };

type PageProps = { params: Promise<{ code: string }> };

function once(value: string): string {
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}

function eventLine(date: string | null, endsAt: string | null, place: string | null, placeSecret: boolean, status: string): string {
  const when = formatEventRange(date, endsAt);
  const where = placeSecret ? null : place;
  return [when, where, status].filter(Boolean).join(" · ");
}

export default async function ManageEventPage({ params }: PageProps) {
  const { code } = await params;
  const lookup = once(code);
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) notFound();
  const access = await loadManageEvent(lookup, data.user.id);
  if (access.kind !== "ok") notFound();

  const event = access.event;
  const origin = await requestOrigin();
  return (
    <ManageHome
      lookup={lookup}
      name={event.name}
      line={eventLine(event.date, event.endsAt, event.place, event.placeSecret, event.status)}
      shareUrl={`${origin}/e/${event.publicToken}`}
      sections={visibleSections(event.role, event.permissions)}
      guestsValue={
        event.isPaid
          ? `${event.registered} reg · ${event.paid} confirmed · ${event.checkedIn} in`
          : `${event.registered} reg · ${event.checkedIn} in`
      }
      paymentValue={event.isPaid ? "Paid entry" : "Free"}
      managersValue={`${event.managers} of ${managerCap()}`}
    />
  );
}
