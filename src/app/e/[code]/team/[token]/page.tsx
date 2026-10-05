import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ScreenHeader } from "@/shared/components/screen-header";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { loadManagerInvite } from "@/shared/services/event-manage";
import { AcceptScreen } from "./accept-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Team" };

type PageProps = { params: Promise<{ code: string; token: string }> };

function once(value: string): string {
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}

export default async function ManagerInvitePage({ params }: PageProps) {
  const { code, token } = await params;
  const lookup = once(code);
  const inviteToken = once(token);
  const next = `/e/${encodeURIComponent(lookup)}/team/${encodeURIComponent(inviteToken)}`;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user || data.user.is_anonymous) {
    redirect(`/register?signin=1&next=${encodeURIComponent(next)}`);
  }

  const invite = await loadManagerInvite(lookup, inviteToken, data.user.id);
  if (invite.kind === "missing") notFound();
  if (invite.kind === "used") {
    return (
      <main className="compass-main min-h-dvh overflow-y-auto bg-white px-[var(--gutter)] text-[var(--ink)]">
        <ScreenHeader title="Team" fallbackHref={`/e/${encodeURIComponent(lookup)}`} />
        <p className="mb-0 t-body text-[var(--ink)]">This link has already been used.</p>
      </main>
    );
  }
  if (invite.kind === "owner") {
    return (
      <main className="compass-main min-h-dvh overflow-y-auto bg-white px-[var(--gutter)] text-[var(--ink)]">
        <ScreenHeader title="Team" fallbackHref={`/e/${encodeURIComponent(lookup)}/manage`} />
        <p className="mb-0 t-body text-[var(--ink)]">You organise {invite.eventName}.</p>
      </main>
    );
  }

  return (
    <AcceptScreen
      lookup={lookup}
      token={inviteToken}
      ownerName={invite.ownerName}
      eventName={invite.eventName}
      access={invite.access}
    />
  );
}
