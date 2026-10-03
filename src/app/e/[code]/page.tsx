import type { Metadata } from "next";
import Link from "next/link";
import { InviteCover } from "@/shared/event/invite-cover";
import { ScreenHeader } from "@/shared/components/screen-header";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { loadOwnerEventCounts } from "@/shared/services/event-registration";
import { loadEventInvite } from "@/shared/services/event-invite";
import { requestOrigin } from "@/shared/services/public-card-meta";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const event = await loadEventInvite(code);
  return { title: event?.name || "ADED" };
}

export default async function EventInvitePage({ params }: PageProps) {
  const { code } = await params;
  const event = await loadEventInvite(code);
  if (!event) {
    return (
      <main className="compass-main fixed inset-0 overflow-y-auto bg-white text-[var(--ink)]">
        <div className="mx-auto min-h-dvh w-full max-w-[430px] px-[var(--gutter)]">
          <ScreenHeader title="Join" fallbackHref="/network/event" />
          <p className="t-body">Event not found</p>
        </div>
      </main>
    );
  }

  let lookup = code.trim();
  try {
    lookup = decodeURIComponent(lookup);
  } catch {
    lookup = code;
  }
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const viewerId = data.user && !data.user.is_anonymous ? data.user.id : null;
  const counts = await loadOwnerEventCounts(event.id, viewerId);
  const origin = await requestOrigin();
  const inviteUrl = `${origin}/e/${event.publicToken}`;

  return (
    <main
      className="compass-main fixed inset-0 overflow-y-auto"
      style={{
        background: `var(--event-theme-${event.theme})`,
        color: `var(--event-theme-${event.theme}-ink)`,
      }}
    >
      <InviteCover
        variant="page"
        layout={event.layout}
        themeId={event.theme}
        inviteUrl={inviteUrl}
        event={{
          name: event.name,
          date: event.date,
          place: event.place,
          placeSecret: event.placeSecret,
          code: event.code,
          logoUrl: event.logoAttachmentId ? `/e/${event.publicToken}/logo` : null,
        }}
      />
      <div className="mx-auto w-full max-w-[430px] px-[var(--gutter)] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        {event.description ? (
          <p className="mt-8 mb-0 max-w-[36ch] whitespace-pre-wrap t-body">{event.description}</p>
        ) : null}
        {counts ? (
          <p className="mt-8 mb-0 t-body">{`Registered ${counts.registered} · Checked-in ${counts.checkedIn}`}</p>
        ) : null}
        <Link
          href={`/e/${encodeURIComponent(lookup)}/join`}
          className="mt-8 inline-block bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]"
        >
          Join
        </Link>
      </div>
    </main>
  );
}
