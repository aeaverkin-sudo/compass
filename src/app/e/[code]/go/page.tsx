import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { findPassGuest } from "@/shared/services/event-guest-pass";
import { loadEventInvite } from "@/shared/services/event-invite";
import { eventHasEnded } from "@/shared/services/events";
import { emailHasAccount, isPermanentAccount } from "@/shared/services/guest-accept";
import { InviteActions } from "../invite-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your pass", robots: { index: false } };

type PageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ g?: string | string[] }>;
};

/**
 * I'm going in the invitation mail. The mail already showed the poster and the consent, so the tap goes straight in.
 * The page script sends the tap: a mail scanner opening the link accepts nothing.
 * Without a session, an email that has its own account gets the poster: no pass account for a real profile.
 */
export default async function GoFromMailPage({ params, searchParams }: PageProps) {
  const { code } = await params;
  const query = await searchParams;
  const token = (Array.isArray(query.g) ? query.g[0] : query.g) ?? "";
  let lookup = code.trim();
  try {
    lookup = decodeURIComponent(lookup);
  } catch {
    lookup = code;
  }
  const base = `/e/${encodeURIComponent(lookup)}`;
  const event = await loadEventInvite(lookup);
  if (!event) redirect(base);
  const guest = await findPassGuest(event.id, token);
  if (!guest) redirect(base);
  const poster = `${base}?g=${encodeURIComponent(guest.token)}`;
  if (eventHasEnded(event.date, event.endsAt)) redirect(poster);

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user ?? null;
  const session = user ? { id: user.id, anonymous: Boolean(user.is_anonymous) } : null;
  const permanent = await isPermanentAccount(session);
  if (!permanent && (!session || session.anonymous) && (await emailHasAccount(guest.email))) redirect(poster);

  return (
    <main className="compass-main flex h-dvh w-full items-center justify-center bg-white px-[var(--gutter)] text-[var(--ink)]">
      <InviteActions
        lookup={lookup}
        token={guest.token}
        permanent={permanent}
        holdsPass={false}
        auto
        ended={false}
        signInHref={`/register?signin=1&next=${encodeURIComponent(`${poster}&go=1`)}`}
        poster={null}
        source="mail"
        waitText="Opening your pass…"
      />
    </main>
  );
}
