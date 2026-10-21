import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { findPassGuest, isGuestToken } from "@/shared/services/event-guest-pass";
import { loadEventInvite } from "@/shared/services/event-invite";
import { CreatePortfolio } from "./create-portfolio";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Create a portfolio", robots: { index: false } };

type PageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ t?: string | string[]; g?: string | string[] }>;
};

function one(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const text = raw?.trim();
  return text || undefined;
}

/**
 * Old letters still open this address.
 * A one-time sign-in (`t=`) stays on the previous screen. Everything else is the portfolio questionnaire.
 */
export default async function CreatePortfolioPage({ params, searchParams }: PageProps) {
  const { code } = await params;
  const query = await searchParams;
  let lookup = code.trim();
  try {
    lookup = decodeURIComponent(lookup);
  } catch {
    // A broken escape stays as written.
  }
  const event = await loadEventInvite(lookup);
  if (!event) notFound();
  const hash = one(query.t);
  const guestToken = one(query.g);
  if (hash) {
    const guest = await findPassGuest(event.id, guestToken);
    return (
      <CreatePortfolio
        lookup={event.slug?.trim() || event.code}
        hash={hash}
        guest={guest ? { token: guest.token, name: guest.name, email: guest.email ?? "" } : null}
      />
    );
  }
  const key = event.slug?.trim() || event.code;
  const next = new URLSearchParams({ event: key });
  if (isGuestToken(guestToken)) next.set("g", guestToken);
  redirect(`/create?${next.toString()}`);
}
