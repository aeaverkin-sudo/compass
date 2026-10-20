import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { findPassGuest } from "@/shared/services/event-guest-pass";
import { loadEventInvite } from "@/shared/services/event-invite";
import { eventHasEnded } from "@/shared/services/events";
import { isPermanentAccount } from "@/shared/services/member-account";
import { InviteActions } from "../invite-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your pass", robots: { index: false } };

type PageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ g?: string | string[] }>;
};

/**
 * I'm going in the invitation mail. A signed-in account joins here. Anyone else goes to Create a portfolio.
 * The page script sends the tap: a mail scanner opening the link accepts nothing.
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
  if (!permanent) redirect(`${base}/create?g=${encodeURIComponent(guest.token)}`);

  return (
    <main className="compass-main flex h-dvh w-full items-center justify-center bg-white px-[var(--gutter)] text-[var(--ink)]">
      <InviteActions
        lookup={lookup}
        token={guest.token}
        permanent
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
