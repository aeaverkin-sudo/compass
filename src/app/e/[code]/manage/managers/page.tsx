import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { listEventManagers, loadManageEvent, managerCap } from "@/shared/services/event-manage";
import { ManagersScreen } from "./managers-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Managers" };

type PageProps = { params: Promise<{ code: string }> };

function once(value: string): string {
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}

export default async function ManageManagersPage({ params }: PageProps) {
  const { code } = await params;
  const lookup = once(code);
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) notFound();
  const access = await loadManageEvent(lookup, data.user.id, "team");
  if (access.kind !== "ok") notFound();
  const managers = await listEventManagers(access.event.id);

  return (
    <ManagersScreen
      lookup={lookup}
      eventName={access.event.name}
      managers={managers}
      canRemove={access.event.role === "owner"}
      full={managers.length >= managerCap()}
    />
  );
}
