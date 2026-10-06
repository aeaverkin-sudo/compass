import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ScreenHeader } from "@/shared/components/screen-header";
import { eventShareLine, formatEventRange } from "@/shared/event/when";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { loadInvitePreview, loadManagerInvite } from "@/shared/services/event-manage";
import { requestOrigin } from "@/shared/services/public-card-meta";
import { AcceptScreen } from "./accept-screen";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ code: string; token: string }> };

function once(value: string): string {
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code, token } = await params;
  const lookup = once(code);
  const inviteToken = once(token);
  const preview = await loadInvitePreview(lookup, inviteToken);
  if (preview.kind !== "open") return { title: "Team invite" };

  const origin = await requestOrigin();
  const title = `You're invited to help run ${preview.eventName}`;
  const when = formatEventRange(preview.date, preview.endsAt);
  const description = `${preview.ownerName} added you to the team for ${preview.eventName}${when ? ` — ${when}` : ""}. Role: ${preview.role}.`;
  const url = `${origin}/e/${encodeURIComponent(lookup)}/team/${encodeURIComponent(inviteToken)}`;
  const image = `${origin}/e/${encodeURIComponent(lookup)}/opengraph-image?team=1&role=${encodeURIComponent(preview.role)}`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
  };
}

function usedInvite(lookup: string) {
  return (
    <main className="compass-main min-h-dvh overflow-y-auto bg-white px-[var(--gutter)] text-[var(--ink)]">
      <ScreenHeader title="Team invite" fallbackHref={`/e/${encodeURIComponent(lookup)}`} />
      <p className="mb-0 t-body text-[var(--ink)]">This link has already been used.</p>
    </main>
  );
}

export default async function ManagerInvitePage({ params }: PageProps) {
  const { code, token } = await params;
  const lookup = once(code);
  const inviteToken = once(token);
  const next = `/e/${encodeURIComponent(lookup)}/team/${encodeURIComponent(inviteToken)}`;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user && !data.user.is_anonymous ? data.user : null;

  if (user) {
    const invite = await loadManagerInvite(lookup, inviteToken, user.id);
    if (invite.kind === "missing") notFound();
    if (invite.kind === "used") return usedInvite(lookup);
    if (invite.kind === "owner") {
      return (
        <main className="compass-main min-h-dvh overflow-y-auto bg-white px-[var(--gutter)] text-[var(--ink)]">
          <ScreenHeader title="Team invite" fallbackHref={`/e/${encodeURIComponent(lookup)}/manage`} />
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
        role={invite.role}
        roleDetail={invite.roleDetail}
        whenLine={eventShareLine(invite.date, invite.endsAt, invite.place, invite.placeSecret)}
        layout={invite.layout}
        themeId={invite.theme}
        cover={{
          name: invite.eventName,
          description: invite.description,
          date: invite.date,
          endDate: invite.endsAt,
          place: invite.place,
          placeSecret: invite.placeSecret,
          logoUrl: invite.logoUrl,
        }}
      />
    );
  }

  const preview = await loadInvitePreview(lookup, inviteToken);
  if (preview.kind === "missing") notFound();
  if (preview.kind === "used") return usedInvite(lookup);
  return (
    <AcceptScreen
      lookup={lookup}
      token={inviteToken}
      ownerName={preview.ownerName}
      eventName={preview.eventName}
      role={preview.role}
      roleDetail={preview.roleDetail}
      whenLine={eventShareLine(preview.date, preview.endsAt, preview.place, preview.placeSecret)}
      layout={preview.layout}
      themeId={preview.theme}
      signInHref={`/register?signin=1&next=${encodeURIComponent(next)}`}
      cover={{
        name: preview.eventName,
        description: preview.description,
        date: preview.date,
        endDate: preview.endsAt,
        place: preview.place,
        placeSecret: preview.placeSecret,
        logoUrl: preview.logoUrl,
      }}
    />
  );
}
