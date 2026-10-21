import type { Metadata } from "next";
import { isEventLookup } from "@/shared/event/lookup";
import { isGuestToken } from "@/shared/services/event-guest-pass";
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
  const guest = one(query.g);
  const event = lookup && isEventLookup(lookup)
    ? { lookup, ...(guest && isGuestToken(guest) ? { guestToken: guest } : {}) }
    : undefined;
  return (
    <EntryPage
      input={{
        name: one(query.name),
        email: one(query.email),
        ...(card && CARD_TOKEN.test(card) ? { sourceToken: card } : {}),
        ...(event ? { event } : {}),
      }}
    />
  );
}
