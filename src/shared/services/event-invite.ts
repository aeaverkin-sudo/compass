import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { isEventLookup } from "@/shared/event/lookup";
import { eventThemeFromStored, isEventLayout, type EventLayoutId, type EventThemeId } from "@/shared/event/themes";
import { formatEventWhen } from "@/shared/event/when";

export { formatEventWhen };

export type EventInvite = {
  id: string;
  name: string;
  logoAttachmentId: string | null;
  description: string | null;
  date: string | null;
  endsAt: string | null;
  place: string | null;
  placeSecret: boolean;
  theme: EventThemeId;
  layout: EventLayoutId;
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

  const face = await readEventFace(row.id);
  return {
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
    publicToken: row.public_token,
    code: row.code,
    slug: row.slug?.trim() || null,
  };
}

/** Layout and end time sit beside the invite. A missing end column still opens. */
async function readEventFace(eventId: string): Promise<{ layout: EventLayoutId; endsAt: string | null }> {
  const admin = createAdminSupabaseClient();
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
