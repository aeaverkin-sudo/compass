import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { loadManageEvent, readEventStats } from "@/shared/services/event-manage";
import { loadGuestBook } from "@/shared/services/event-guest-lists";
import { countCardsExchanged } from "@/shared/services/event-export";
import { eventHasEnded } from "@/shared/services/events";
import { formatEventWhen } from "@/shared/event/when";
import { isPaidGuest, isPendingGuest } from "@/shared/event/guest-sources";
import { StatsScreen } from "./stats-screen";
import { eventTitleLine } from "@/shared/event/event-title";

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
  const event = access.event;
  const ended = eventHasEnded(event.date, event.endsAt);
  const [stats, book, cards] = await Promise.all([
    readEventStats(event.id, { start: event.date, end: event.endsAt }),
    ended ? loadGuestBook(event.id).catch(() => null) : Promise.resolve(null),
    ended ? countCardsExchanged(event.id) : Promise.resolve(0),
  ]);
  const guests = book?.guests ?? [];

  return (
    <StatsScreen
      lookup={lookup}
      name={eventTitleLine(event.name)}
      date={event.date}
      endsAt={event.endsAt}
      timeZone={event.timeZone}
      isPaid={event.isPaid}
      stats={stats}
      after={
        ended
          ? {
              endedLabel: formatEventWhen(event.endsAt ?? event.date, event.timeZone) ?? "",
              came: book ? book.checkedIn : event.checkedIn,
              total: book ? book.total : event.registered,
              cards,
              paid: event.isPaid
                ? {
                    paid: book ? guests.filter(isPaidGuest).length : event.paid,
                    pending: book ? guests.filter(isPendingGuest).length : Math.max(0, event.registered - event.paid),
                  }
                : null,
            }
          : null
      }
    />
  );
}
