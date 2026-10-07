import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ScreenHeader } from "@/shared/components/screen-header";
import { Zone } from "@/shared/components/zone";
import { formatEventRange } from "@/shared/event/when";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { loadInvitePreview, loadManagerInvite } from "@/shared/services/event-manage";
import { requestOrigin } from "@/shared/services/public-card-meta";
import { AcceptScreen } from "./accept-screen";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ code: string; token: string }>;
  searchParams: Promise<{ accept?: string | string[] }>;
};

function wantsAccept(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) === "1";
}

function whereLine(place: string | null, placeSecret: boolean): string | null {
  if (placeSecret) return "Revealed closer to the date";
  const text = place?.trim() ?? "";
  return text || null;
}

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

function inviteNotice(href: string, text: string) {
  return (
    <main className="compass-main min-h-dvh overflow-y-auto bg-white px-[var(--gutter)] pb-[max(2.5rem,env(safe-area-inset-bottom))] text-[var(--ink)]">
      <ScreenHeader title="Team invite" fallbackHref={href} />
      <Zone label="">
        <p className="mb-0 t-body text-[var(--ink)]">{text}</p>
      </Zone>
    </main>
  );
}

export default async function ManagerInvitePage({ params, searchParams }: PageProps) {
  const { code, token } = await params;
  const query = await searchParams;
  const lookup = once(code);
  const inviteToken = once(token);
  const returnTo = `/e/${encodeURIComponent(lookup)}/team/${encodeURIComponent(inviteToken)}?accept=1`;
  const signInHref = `/register?signin=1&next=${encodeURIComponent(returnTo)}`;
  const signUpHref = `/register?next=${encodeURIComponent(returnTo)}`;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user && !data.user.is_anonymous ? data.user : null;
  const anonymous = Boolean(data.user?.is_anonymous);

  if (user) {
    const invite = await loadManagerInvite(lookup, inviteToken, user.id);
    if (invite.kind === "missing") notFound();
    if (invite.kind === "used") {
      return inviteNotice(`/e/${encodeURIComponent(lookup)}`, "This link has already been used.");
    }
    if (invite.kind === "owner") {
      return inviteNotice(`/e/${encodeURIComponent(lookup)}/manage`, `You organise ${invite.eventName}.`);
    }
    return (
      <AcceptScreen
        lookup={lookup}
        token={inviteToken}
        ownerName={invite.ownerName}
        eventName={invite.eventName}
        role={invite.role}
        roleDetail={invite.roleDetail}
        when={formatEventRange(invite.date, invite.endsAt)}
        where={whereLine(invite.place, invite.placeSecret)}
        layout={invite.layout}
        themeId={invite.theme}
        autoAccept={wantsAccept(query.accept)}
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
  if (preview.kind === "used") {
    return inviteNotice(`/e/${encodeURIComponent(lookup)}`, "This link has already been used.");
  }
  return (
    <AcceptScreen
      lookup={lookup}
      token={inviteToken}
      ownerName={preview.ownerName}
      eventName={preview.eventName}
      role={preview.role}
      roleDetail={preview.roleDetail}
      when={formatEventRange(preview.date, preview.endsAt)}
      where={whereLine(preview.place, preview.placeSecret)}
      layout={preview.layout}
      themeId={preview.theme}
      anonymous={anonymous}
      signInHref={signInHref}
      signUpHref={signUpHref}
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
