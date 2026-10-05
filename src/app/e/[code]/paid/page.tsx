import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { loadEventInvite } from "@/shared/services/event-invite";
import { loadOwnRegistration } from "@/shared/services/event-registration";
import { markPaidFromReturn } from "@/shared/services/event-payment";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ code: string }> };

function once(value: string): string {
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}

/**
 * Return URL for the organiser's own checkout.
 * MVP: opening this page marks the guest paid. We do not verify that money moved.
 * The CSV statement is the accurate reconciliation.
 */
export default async function EventPaidPage({ params }: PageProps) {
  const { code } = await params;
  const lookup = once(code);
  const invite = `/e/${encodeURIComponent(lookup)}`;
  const event = await loadEventInvite(lookup);
  if (!event) redirect("/network/event");

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user || user.is_anonymous) redirect(invite);

  const registration = await loadOwnRegistration(event.id, user.id);
  if (!registration) redirect(invite);

  await markPaidFromReturn(event.id, user.id);
  redirect(`/e/${encodeURIComponent(lookup)}/join`);
}
