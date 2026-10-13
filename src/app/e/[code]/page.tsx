import type { Metadata } from "next";
import Link from "next/link";
import { CoverButton } from "@/shared/event/cover-button";
import { ScreenHeader } from "@/shared/components/screen-header";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { previewPriceKey, previewPriceLabel, priceLabel } from "@/shared/event/payment-label";
import { loadOwnerEventCounts } from "@/shared/services/event-registration";
import { loadEventInvite } from "@/shared/services/event-invite";
import { loadEventPay, loadPreviewPay } from "@/shared/services/event-payment";
import { eventPreviewLine } from "@/shared/event/when";
import { eventPublicPath } from "@/shared/event/slug";
import { eventListStatus } from "@/shared/services/events";
import { requestOrigin } from "@/shared/services/public-card-meta";
import { eventTitleLine } from "@/shared/event/event-title";
import { findPassGuest } from "@/shared/services/event-guest-pass";
import { holdsEventPass, isPermanentAccount } from "@/shared/services/guest-accept";
import { InviteActions } from "./invite-actions";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ from?: string | string[]; g?: string | string[]; go?: string | string[] }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const event = await loadEventInvite(code);
  if (!event) return { title: "ADED" };
  const pay = await loadPreviewPay(event.id);
  const origin = await requestOrigin();
  const title = eventTitleLine(event.name) || "ADED";
  const description = eventPreviewLine(event.date, event.endsAt, event.place, event.placeSecret, previewPriceLabel(pay), event.timeZone) ?? undefined;
  const slug = event.slug?.trim() || event.code.trim() || code;
  const url = `${origin}${eventPublicPath(slug)}`;
  const image = `${url}/opengraph-image?v=${previewVersion(event, pay)}`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: "ADED",
      type: "website",
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: title,
          type: "image/png",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

function previewVersion(
  event: {
    name: string;
    date: string | null;
    endsAt: string | null;
    timeZone: string;
    place: string | null;
    logoAttachmentId: string | null;
    theme: string;
    layout: string;
    inviteRows: unknown;
    logoLook: string | null;
  },
  pay: { isPaid: boolean; price: number | null; currency: string; tiers?: { price: number | null }[] },
) {
  const raw = [
    event.name,
    event.date,
    event.endsAt,
    event.timeZone,
    event.place,
    event.logoAttachmentId,
    event.theme,
    event.layout,
    previewPriceKey(pay),
    JSON.stringify(event.inviteRows ?? null),
    event.logoLook,
  ].join("\n");
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) hash = (hash * 31 + raw.charCodeAt(index)) >>> 0;
  return hash.toString(36);
}

export default async function EventInvitePage({ params, searchParams }: PageProps) {
  const { code } = await params;
  const query = await searchParams;
  const from = Array.isArray(query.from) ? query.from[0] : query.from;
  const fromList = from === "events";
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
  const user = data.user ?? null;
  const pay = await loadEventPay(event.id);
  const posterPrice = pay.isPaid ? priceLabel(pay.price, pay.currency) : null;
  const ended = eventListStatus(event.date, Date.now(), event.endsAt) === "past";
  const guestToken = Array.isArray(query.g) ? query.g[0] : query.g;
  const go = (Array.isArray(query.go) ? query.go[0] : query.go) === "1";
  const guest = guestToken ? await findPassGuest(event.id, guestToken) : null;
  const session = user ? { id: user.id, anonymous: Boolean(user.is_anonymous) } : null;
  const permanent = await isPermanentAccount(session);
  const holdsPass = !permanent && !guest && (await holdsEventPass(session, event.id));
  const viewerId = user && !user.is_anonymous ? user.id : null;
  const counts = await loadOwnerEventCounts(event.id, viewerId);
  const back = guest ? `/e/${encodeURIComponent(lookup)}?g=${guest.token}&go=1` : `/e/${encodeURIComponent(lookup)}/join`;
  const signInHref = `/register?signin=1&next=${encodeURIComponent(back)}`;
  const opensPass = !ended || Boolean(guest?.registrationId);
  const auto = Boolean(guest) && ((ended && Boolean(guest?.registrationId)) || (go && permanent));
  const poster = (
    <CoverButton
      variant="card"
      layout={event.layout}
      themeId={event.theme}
      event={{
        name: event.name,
        description: event.description,
        date: event.date,
        endDate: event.endsAt,
        timeZone: event.timeZone,
        place: event.place,
        placeSecret: event.placeSecret,
        logoUrl: event.logoAttachmentId ? `/e/${event.publicToken}/logo` : null,
        price: posterPrice,
        inviteRows: event.inviteRows,
        logoLook: event.logoLook,
      }}
    />
  );

  return (
    <main className="compass-main flex h-dvh w-full flex-col overflow-hidden bg-white text-[var(--ink)]">
      {fromList ? (
        <div
          className="flex shrink-0 items-center px-5"
          style={{ height: "calc(env(safe-area-inset-top) + 44px)", paddingTop: "env(safe-area-inset-top)" }}
        >
          <Link
            href="/network/event"
            className="press t-body text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]"
          >
            ‹ Events
          </Link>
        </div>
      ) : null}
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex w-full max-w-[380px] flex-col items-center">
          {guest ? <p className="mt-0 mb-4 t-meta text-[var(--grey)]">{`Invitation for ${guest.name}`}</p> : null}
          {opensPass ? (
            <InviteActions
              lookup={lookup}
              token={guest?.token ?? null}
              permanent={permanent}
              holdsPass={holdsPass}
              auto={auto}
              ended={ended}
              signInHref={signInHref}
              poster={poster}
            />
          ) : (
            poster
          )}
          {counts ? (
            <p className="mt-8 mb-0 t-body">{`Registered ${counts.registered} · Checked-in ${counts.checkedIn}`}</p>
          ) : null}
          {ended ? <p className="mt-8 mb-0 t-meta text-[var(--grey)]">This event has ended</p> : null}
        </div>
      </div>
    </main>
  );
}
