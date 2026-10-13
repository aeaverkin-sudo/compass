import type { Metadata } from "next";
import { loadEventInvite } from "@/shared/services/event-invite";
import { findPassGuest } from "@/shared/services/event-guest-pass";
import { eventTitleLine } from "@/shared/event/event-title";
import { UnsubscribeButton } from "./unsubscribe-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

type PageProps = { params: Promise<{ code: string }>; searchParams: Promise<{ g?: string | string[] }> };

export default async function UnsubscribePage({ params, searchParams }: PageProps) {
  const { code } = await params;
  const query = await searchParams;
  const token = Array.isArray(query.g) ? query.g[0] : query.g;
  const event = await loadEventInvite(code);
  const guest = event && token ? await findPassGuest(event.id, token) : null;
  const name = event ? eventTitleLine(event.name) : "";

  return (
    <main className="compass-main flex min-h-dvh w-full flex-col items-center justify-center bg-white px-[var(--gutter)] text-center text-[var(--ink)]">
      {!event || !guest ? (
        <p className="m-0 t-body text-[var(--grey)]">This link is not valid.</p>
      ) : (
        <UnsubscribeButton
          lookup={code}
          token={guest.token}
          done={Boolean(guest.unsubscribedAt)}
          doneText={`You won't get mail about ${name}. Your pass still works.`}
        />
      )}
    </main>
  );
}
