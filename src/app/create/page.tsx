import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isEventLookup } from "@/shared/event/lookup";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { sessionUser } from "@/shared/lib/supabase/session-user";
import { findPassGuest, isGuestToken } from "@/shared/services/event-guest-pass";
import { loadEventInvite } from "@/shared/services/event-invite";
import { doorNext } from "./door";
import { EntryPage } from "./entry-page";

export const metadata: Metadata = { title: "Create a portfolio", robots: { index: false } };

const CARD_TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

type PageProps = {
  searchParams: Promise<{
    name?: string | string[];
    email?: string | string[];
    card?: string | string[];
    event?: string | string[];
    g?: string | string[];
    next?: string | string[];
    pick?: string | string[];
    account?: string | string[];
    saved?: string | string[];
  }>;
};

function one(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const text = raw?.trim();
  return text || undefined;
}

export default async function CreatePage({ searchParams }: PageProps) {
  const query = await searchParams;
  const card = one(query.card);
  const next = doorNext(one(query.next));
  const lookup = one(query.event);
  const guestToken = one(query.g);
  const event = lookup && isEventLookup(lookup)
    ? { lookup, ...(guestToken && isGuestToken(guestToken) ? { guestToken } : {}) }
    : undefined;
  let name = one(query.name);
  let email = one(query.email);
  if (event?.guestToken && (!name || !email)) {
    const invite = await loadEventInvite(event.lookup);
    const person = invite ? await findPassGuest(invite.id, event.guestToken) : null;
    if (person) {
      if (!name) name = person.name.trim() || undefined;
      if (!email) email = person.email?.trim().toLowerCase() || undefined;
    }
  }
  const telegram =
    Boolean(event) && /Telegram/i.test((await headers()).get("user-agent") ?? "");
  let account = false;
  let needsConsent = false;
  if (one(query.account) === "1") {
    const user = await sessionUser();
    if (user && !user.is_anonymous) {
      const admin = createAdminSupabaseClient();
      const cards = await admin.from("cards").select("id", { count: "exact", head: true }).eq("owner_id", user.id);
      if (cards.error || (cards.count ?? 0) > 0) redirect("/main");
      account = true;
      const consent = await admin.from("consents").select("id").eq("user_id", user.id).limit(1).maybeSingle();
      needsConsent = Boolean(consent.error) || !consent.data;
      if (!name) {
        const meta = user.user_metadata as { full_name?: unknown; name?: unknown } | undefined;
        const given = typeof meta?.full_name === "string" ? meta.full_name : typeof meta?.name === "string" ? meta.name : "";
        name = given.trim() || undefined;
      }
    }
  }
  return (
    <EntryPage
      pick={one(query.pick) === "1"}
      telegram={telegram}
      account={account}
      needsConsent={needsConsent}
      savedContact={account && one(query.saved) === "1"}
      input={{
        name,
        email,
        ...(card && CARD_TOKEN.test(card) ? { sourceToken: card } : {}),
        ...(event ? { event } : {}),
        ...(next && !(card && CARD_TOKEN.test(card)) && !event ? { next } : {}),
      }}
    />
  );
}
