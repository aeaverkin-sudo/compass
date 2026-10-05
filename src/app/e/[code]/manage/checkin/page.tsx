import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { loadCheckinDesk, loadManageEvent } from "@/shared/services/event-manage";
import { CheckinScreen } from "./checkin-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Check-in" };

type PageProps = { params: Promise<{ code: string }> };

function once(value: string): string {
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}

export default async function ManageCheckinPage({ params }: PageProps) {
  const { code } = await params;
  const lookup = once(code);
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) notFound();
  const access = await loadManageEvent(lookup, data.user.id, "checkin");
  if (access.kind !== "ok") notFound();
  const desk = await loadCheckinDesk(access.event.id, data.user.id);

  return (
    <CheckinScreen
      lookup={lookup}
      name={access.event.name}
      registered={desk.registered}
      checkedIn={desk.checkedIn}
      last={desk.last}
      roster={desk.roster}
    />
  );
}
