import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { listEventGuests, loadManageEvent } from "@/shared/services/event-manage";
import { GuestsScreen } from "./guests-screen";
import { eventTitleLine } from "@/shared/event/event-title";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Guests" };

type PageProps = { params: Promise<{ code: string }> };

function once(value: string): string {
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}

export default async function ManageGuestsPage({ params }: PageProps) {
  const { code } = await params;
  const lookup = once(code);
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) notFound();
  const access = await loadManageEvent(lookup, data.user.id, "guests");
  if (access.kind !== "ok") notFound();
  const list = await listEventGuests(access.event.id);

  return (
    <GuestsScreen
      lookup={lookup}
      name={eventTitleLine(access.event.name)}
      guests={list.guests}
      canMark={access.event.role === "owner" || access.event.permissions.payments}
      isPaid={access.event.isPaid}
    />
  );
}
