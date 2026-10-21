import type { Metadata } from "next";
import { isEventLookup } from "@/shared/event/lookup";
import { findPassGuest, isGuestToken } from "@/shared/services/event-guest-pass";
import { loadEventInvite } from "@/shared/services/event-invite";
import { EntryPage } from "./entry-page";

export const metadata: Metadata = { title: "Create a portfolio", robots: { index: false } };

const CARD_TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

type PageProps = {
  searchParams: Promise<{ name?: string | string[]; email?: string | string[]; card?: string | string[]; event?: string | string[]; g?: string | string[] }>;
};

function one(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const text = raw?.trim();
  return text || undefined;
}

export default async function CreatePage({ searchParams }: PageProps) {
  const query = await searchParams;
  const card = one(query.card);
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
  return (
    <EntryPage
      input={{
        name,
        email,
        ...(card && CARD_TOKEN.test(card) ? { sourceToken: card } : {}),
        ...(event ? { event } : {}),
      }}
    />
  );
}
