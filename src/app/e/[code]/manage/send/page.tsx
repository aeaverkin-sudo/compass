import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { loadManageEvent } from "@/shared/services/event-manage";
import { loadGuestBook } from "@/shared/services/event-guest-lists";
import { eventMailsReady, inviteMail, loadMailEvent, pendingInvitees } from "@/shared/services/event-mails";
import { requestOrigin } from "@/shared/services/public-card-meta";
import { eventPublicPath } from "@/shared/event/slug";
import { SendScreen } from "./send-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Send passes" };

type PageProps = { params: Promise<{ code: string }> };

function once(value: string): string {
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}

export default async function SendPassesPage({ params }: PageProps) {
  const { code } = await params;
  const lookup = once(code);
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) notFound();
  const access = await loadManageEvent(lookup, data.user.id, "guests");
  if (access.kind !== "ok") notFound();
  const [event, origin, ready, book] = await Promise.all([
    loadMailEvent(lookup),
    requestOrigin(),
    eventMailsReady(),
    loadGuestBook(access.event.id).catch(() => null),
  ]);
  if (!event) notFound();
  const invitees = ready ? await pendingInvitees(access.event.id) : [];
  const first = invitees[0];
  const preview = first ? inviteMail(origin, event, first, { width: "100%", outer: { y: 0, x: 0 } }).body : null;

  return (
    <SendScreen
      lookup={lookup}
      preview={preview}
      count={invitees.length}
      passes={book?.passes ?? []}
      inviteUrl={`${origin}${eventPublicPath(event.key)}`}
      ready={ready}
    />
  );
}
