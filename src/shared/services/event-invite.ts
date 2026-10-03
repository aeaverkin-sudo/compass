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
  place: string | null;
  placeSecret: boolean;
  theme: EventThemeId;
  layout: EventLayoutId;
  publicToken: string;
  code: string;
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

  return {
    id: row.id,
    name: row.name,
    logoAttachmentId: row.logo_attachment_id,
    description: row.description?.trim() || null,
    date: row.date,
    place: row.place?.trim() || null,
    placeSecret: row.place_secret,
    theme: eventThemeFromStored(row.theme),
    layout: await readEventLayout(row.id),
    publicToken: row.public_token,
    code: row.code,
  };
}

/** Missing column and an unknown value both open as Business. */
async function readEventLayout(eventId: string): Promise<EventLayoutId> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("events").select("layout").eq("id", eventId).maybeSingle();
  if (error || !data) return "grid";
  const value = String((data as { layout?: string | null }).layout ?? "");
  return isEventLayout(value) ? value : "grid";
}
