import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findPassGuest } from "@/shared/services/event-guest-pass";
import { loadEventInvite } from "@/shared/services/event-invite";
import { SignupScreen } from "./signup-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Create a portfolio", robots: { index: false } };

type PageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ g?: string | string[] }>;
};

/** Create a portfolio on the open link or a personal invite. */
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
  const guestToken = Array.isArray(query.g) ? query.g[0] : query.g;
  const guest = await findPassGuest(event.id, guestToken);
  return (
    <SignupScreen
      event={{ lookup }}
      guest={guest ? { token: guest.token, name: guest.name, email: guest.email ?? "" } : null}
    />
  );
}
