import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isGuestToken } from "@/shared/services/event-guest-pass";
import { loadEventInvite } from "@/shared/services/event-invite";

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

/** Old letters still open this address. Every one of them is the shared questionnaire. */
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
  const guestToken = one(query.g);
  const key = event.slug?.trim() || event.code;
  const next = new URLSearchParams({ event: key });
  if (isGuestToken(guestToken)) next.set("g", guestToken);
  redirect(`/create?${next.toString()}`);
}
