import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { cardIsPubliclyServed, readyAttachmentIds } from "@/shared/services/public-card";

export type GoingPerson = {
  token: string;
  name: string;
  title: string;
  photoUrl: string | null;
  self: boolean;
};

export type GoingSummary = {
  /** The people on the going list, so the number matches it. */
  going: number;
  /** Check-ins once the door opened, else everyone who was going. */
  wereThere: number;
  met: number;
};

/** Off only when the organiser switched it off. A missing column reads as on. */
export async function loadShowGoing(eventId: string): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("events").select("show_going").eq("id", eventId).maybeSingle();
  if (error) {
    if (/show_going/i.test(error.message)) return true;
    throw new Error(error.message);
  }
  return (data as { show_going?: boolean | null } | null)?.show_going !== false;
}

export async function saveShowGoing(eventId: string, on: boolean): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("events").update({ show_going: on }).eq("id", eventId);
  if (error) {
    if (/show_going/i.test(error.message)) return false;
    throw new Error(error.message);
  }
  return true;
}

async function isRegistered(eventId: string, userId: string): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("event_registrations")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/** The line under the poster. Only for someone on this event, and only while the organiser shows it. */
export async function loadGoingSummary(eventId: string, viewerId: string | null): Promise<GoingSummary | null> {
  if (!viewerId) return null;
  if (!(await loadShowGoing(eventId))) return null;
  if (!(await isRegistered(eventId, viewerId))) return null;

  const admin = createAdminSupabaseClient();
  const [going, everyone, checkedIn, met] = await Promise.all([
    loadGoingPeople(eventId, viewerId),
    admin.from("event_registrations").select("id", { count: "exact", head: true }).eq("event_id", eventId),
    admin
      .from("event_registrations")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .not("checked_in_at", "is", null),
    admin
      .from("connections")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", viewerId)
      .eq("source_event_id", eventId),
  ]);
  if (everyone.error) throw new Error(everyone.error.message);
  if (checkedIn.error) throw new Error(checkedIn.error.message);
  const total = everyone.count ?? 0;
  const inside = checkedIn.count ?? 0;
  return {
    going: going?.length ?? 0,
    wereThere: inside > 0 ? inside : total,
    met: met.error ? 0 : (met.count ?? 0),
  };
}

/**
 * Cards of those going who allow connections. A card that is not served
 * publicly (no name, private) stays out: it would not open.
 */
export async function loadGoingPeople(eventId: string, viewerId: string | null): Promise<GoingPerson[] | null> {
  if (!viewerId) return null;
  if (!(await loadShowGoing(eventId))) return null;
  if (!(await isRegistered(eventId, viewerId))) return null;

  const admin = createAdminSupabaseClient();
  const { data: regs, error } = await admin
    .from("event_registrations")
    .select("user_id, card_id, created_at")
    .eq("event_id", eventId)
    .eq("consent_connections", true)
    .not("card_id", "is", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (regs ?? []) as { user_id: string; card_id: string }[];
  if (rows.length === 0) return [];

  const { data: cards, error: cardError } = await admin
    .from("cards")
    .select("id, owner_id, display_name, title, status, public_token, is_public, photo_attachment_id")
    .in(
      "id",
      rows.map((row) => row.card_id),
    );
  if (cardError) throw new Error(cardError.message);
  const byId = new Map(
    (
      (cards ?? []) as {
        id: string;
        owner_id: string;
        display_name: string | null;
        title: string | null;
        status: string;
        public_token: string;
        is_public: boolean;
        photo_attachment_id: string | null;
      }[]
    ).map((card) => [card.id, card]),
  );
  const ready = await readyAttachmentIds(
    [...byId.values()].map((card) => card.photo_attachment_id).filter((id): id is string => Boolean(id)),
  );

  const people: GoingPerson[] = [];
  for (const row of rows) {
    const card = byId.get(row.card_id);
    if (!card || card.owner_id !== row.user_id || !cardIsPubliclyServed(card)) continue;
    const photo = card.photo_attachment_id && ready.has(card.photo_attachment_id) ? card.photo_attachment_id : null;
    people.push({
      token: card.public_token,
      name: (card.display_name ?? "").replace(/\s*\n\s*/g, " ").trim(),
      title: (card.title ?? "").trim(),
      photoUrl: photo ? `/f/${photo}` : null,
      self: row.user_id === viewerId,
    });
  }
  return people;
}
