import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { loadManageEvent, readEventStats } from "@/shared/services/event-manage";
import { StatsScreen } from "./stats-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Statistics" };

type PageProps = { params: Promise<{ code: string }> };

function once(value: string): string {
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}

export default async function ManageStatsPage({ params }: PageProps) {
  const { code } = await params;
  const lookup = once(code);
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) notFound();
  const access = await loadManageEvent(lookup, data.user.id, "analytics");
  if (access.kind !== "ok") notFound();
  const stats = await readEventStats(access.event.id, {
    start: access.event.date,
    end: access.event.endsAt,
  });

  return (
    <StatsScreen
      lookup={lookup}
      name={access.event.name}
      date={access.event.date}
      endsAt={access.event.endsAt}
      isPaid={access.event.isPaid}
      stats={stats}
    />
  );
}
