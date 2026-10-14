import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { listEventManagers, loadManageEvent, managerCap } from "@/shared/services/event-manage";
import { eventTitleLine } from "@/shared/event/event-title";
import { StaffScreen } from "./staff-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Staff" };

type PageProps = { params: Promise<{ code: string }> };

function once(value: string): string {
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}

export default async function ManageStaffPage({ params }: PageProps) {
  const { code } = await params;
  const lookup = once(code);
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) notFound();
  const access = await loadManageEvent(lookup, data.user.id, "team");
  if (access.kind !== "ok") notFound();
  const event = access.event;
  const managers = await listEventManagers(event.id);

  return (
    <StaffScreen
      lookup={lookup}
      eventName={eventTitleLine(event.name)}
      managers={managers}
      canRemove={event.role === "owner"}
      full={managers.length >= managerCap()}
    />
  );
}
