import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { isEventLookup } from "@/shared/event/lookup";
import { isEventTheme, type EventThemeId } from "@/shared/event/themes";

export type EventInvite = {
  id: string;
  name: string;
  logoAttachmentId: string | null;
  description: string | null;
  date: string | null;
  place: string | null;
  placeSecret: boolean;
  theme: EventThemeId;
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
    theme: isEventTheme(row.theme) ? row.theme : "paper",
    publicToken: row.public_token,
    code: row.code,
  };
}

/** Date, then time when the organiser set one. Midnight stays a date only. */
export function formatEventWhen(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const day = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
  if (date.getHours() === 0 && date.getMinutes() === 0) return day;
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${day} · ${time}`;
}
