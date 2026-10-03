import type { Metadata } from "next";
import Link from "next/link";
import { InviteQr } from "@/shared/event/invite-qr";
import { ScreenHeader } from "@/shared/components/screen-header";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { loadOwnerEventCounts } from "@/shared/services/event-registration";
import { formatEventWhen, loadEventInvite } from "@/shared/services/event-invite";
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
  const when = formatEventWhen(event.date);
  const place = event.placeSecret ? "Revealed closer to the date" : event.place;

  return (
    <main
      className="compass-main fixed inset-0 overflow-y-auto"
      style={{
        background: `var(--event-theme-${event.theme})`,
        color: `var(--event-theme-${event.theme}-ink)`,
      }}
    >
      <article className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-[var(--gutter)] pt-[max(3rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        {event.logoAttachmentId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/e/${event.publicToken}/logo`}
            alt=""
            className="mb-8 size-16 object-contain"
          />
        ) : null}
        <h1
          className="m-0 max-w-[14ch] font-light"
          style={{ fontSize: 40, lineHeight: 1.05, letterSpacing: "-0.03em" }}
        >
          {event.name}
        </h1>
        {when ? <p className="mt-8 mb-0 t-body">{when}</p> : null}
        {place ? <p className={`${when ? "mt-1" : "mt-8"} mb-0 t-body`}>{place}</p> : null}
        {event.description ? (
          <p className="mt-6 mb-0 max-w-[36ch] whitespace-pre-wrap t-body">{event.description}</p>
        ) : null}
        <div className="mt-auto pt-16">
          {counts ? (
            <p className="mb-8 t-body">{`Registered ${counts.registered} · Checked-in ${counts.checkedIn}`}</p>
          ) : null}
          <InviteQr url={inviteUrl} />
          <p className="mt-4 mb-0 t-body" style={{ letterSpacing: "0.1em" }}>
            {event.code}
          </p>
          <Link
            href={`/e/${encodeURIComponent(lookup)}/join`}
            className="mt-8 inline-block bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]"
          >
            Join
          </Link>
        </div>
      </article>
    </main>
  );
}
