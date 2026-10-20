import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { isEventLookup } from "@/shared/event/lookup";
import { eventThemeFromStored, isEventLayout, type EventLayoutId, type EventThemeId } from "@/shared/event/themes";
import { formatEventWhen } from "@/shared/event/when";
import { loadEventTimeZone } from "@/shared/services/event-time-zone";
import {
  isInviteLogoLook,
  readInviteRows,
  type InviteLogoLook,
  type InviteRow as CardInviteRow,
} from "@/shared/event/invite-rows";

export { formatEventWhen };

export type EventInvite = {
  id: string;
  name: string;
  logoAttachmentId: string | null;
  description: string | null;
  date: string | null;
  endsAt: string | null;
  /** IANA zone the event's times are read in. */
  timeZone: string;
  place: string | null;
  placeSecret: boolean;
  theme: EventThemeId;
  layout: EventLayoutId;
  inviteRows: CardInviteRow[] | null;
  logoLook: InviteLogoLook | null;
  posterUpdatedAt: string | null;
  publicToken: string;
  code: string;
  slug: string | null;
};

type InviteRow = {
  id: string;
  name: string;
  logo_attachment_id: string | null;
  description: string | null;
  date: string | null;
  place: string | null;
  place_secret: boolean;
  theme: string;
  public_token: string;
  code: string;
  slug?: string | null;
};

/** One invite, by short code or public token. Missing and unknown lookups are the same. */
export async function loadEventInvite(lookup: string): Promise<EventInvite | null> {
  let key = lookup.trim();
  try {
    key = decodeURIComponent(key);
  } catch {
    // A broken escape is not an invite.
  }
  if (!isEventLookup(key)) return null;

  const admin = createAdminSupabaseClient();
  const loaded = await admin.rpc("event_invite", { lookup: key });
  if (loaded.error) {
    console.error("[events] invite", loaded.error.message);
    return null;
  }

  const row = (Array.isArray(loaded.data) ? loaded.data[0] : loaded.data) as InviteRow | undefined;
  if (!row?.id || !row.public_token || !row.code) return null;

  const [face, timeZone, poster] = await Promise.all([
    readEventFace(row.id),
    loadEventTimeZone(row.id),
    admin.from("events").select("poster_updated_at").eq("id", row.id).maybeSingle(),
  ]);
  return {
    timeZone,
    id: row.id,
    name: row.name,
    logoAttachmentId: row.logo_attachment_id,
    description: row.description?.trim() || null,
    date: row.date,
    endsAt: face.endsAt,
    place: row.place?.trim() || null,
    placeSecret: row.place_secret,
    theme: eventThemeFromStored(row.theme),
    layout: face.layout,
    inviteRows: face.inviteRows ?? null,
    logoLook: face.logoLook ?? null,
    posterUpdatedAt: poster.error ? null : ((poster.data as { poster_updated_at?: string | null } | null)?.poster_updated_at ?? null),
    publicToken: row.public_token,
    code: row.code,
    slug: row.slug?.trim() || null,
  };
}

type EventFace = {
  layout: EventLayoutId;
  endsAt: string | null;
  inviteRows?: CardInviteRow[] | null;
  logoLook?: InviteLogoLook | null;
};

/** Layout, end time and the card rows sit beside the invite. Missing columns still open. */
async function readEventFace(eventId: string): Promise<EventFace> {
  const admin = createAdminSupabaseClient();
  const withCard = await admin
    .from("events")
    .select("layout, ends_at, invite_rows, logo_look")
    .eq("id", eventId)
    .maybeSingle();
  if (!withCard.error && withCard.data) {
    const row = withCard.data as {
      layout?: string | null;
      ends_at?: string | null;
      invite_rows?: unknown;
      logo_look?: string | null;
    };
    const value = String(row.layout ?? "");
    const rows = readInviteRows(row.invite_rows);
    return {
      layout: isEventLayout(value) ? value : "grid",
      endsAt: row.ends_at ?? null,
      inviteRows: rows.length > 0 ? rows : null,
      logoLook: isInviteLogoLook(row.logo_look) ? row.logo_look : null,
    };
  }
  const withEnd = await admin.from("events").select("layout, ends_at").eq("id", eventId).maybeSingle();
  if (withEnd.error && /ends_at/i.test(withEnd.error.message) && /column|schema/i.test(withEnd.error.message)) {
    const layoutOnly = await admin.from("events").select("layout").eq("id", eventId).maybeSingle();
    if (layoutOnly.error || !layoutOnly.data) return { layout: "grid", endsAt: null };
    const value = String((layoutOnly.data as { layout?: string | null }).layout ?? "");
    return { layout: isEventLayout(value) ? value : "grid", endsAt: null };
  }
  if (withEnd.error || !withEnd.data) return { layout: "grid", endsAt: null };
  const row = withEnd.data as { layout?: string | null; ends_at?: string | null };
  const value = String(row.layout ?? "");
  return { layout: isEventLayout(value) ? value : "grid", endsAt: row.ends_at ?? null };
}
