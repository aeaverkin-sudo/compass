import { nanoid } from "nanoid";
import type { GuestListKind } from "@/shared/event/guest-book";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";

export type { GuestListKind };

export const SYSTEM_LIST_NAME: Record<Exclude<GuestListKind, "file">, string> = {
  manual: "Added by hand",
  open: "Open link",
};

export type OpenLink = { open: boolean; capacity: number | null };

/** Before the cabinet migration every event stays open, as it was. */
export async function loadOpenLink(eventId: string): Promise<OpenLink> {
  const admin = createAdminSupabaseClient();
  const full = await admin.from("events").select("open_link, capacity").eq("id", eventId).maybeSingle();
  if (!full.error) {
    const row = full.data as { open_link?: boolean | null; capacity?: number | null } | null;
    const capacity = typeof row?.capacity === "number" && row.capacity > 0 ? row.capacity : null;
    return { open: row?.open_link !== false, capacity };
  }
  if (!/open_link|capacity/i.test(full.error.message)) throw new Error(full.error.message);
  return { open: true, capacity: null };
}

export async function saveOpenLink(eventId: string, patch: { open?: boolean; capacity?: number | null }): Promise<boolean> {
  const row: { open_link?: boolean; capacity?: number | null } = {};
  if (typeof patch.open === "boolean") row.open_link = patch.open;
  if (patch.capacity !== undefined) row.capacity = patch.capacity;
  if (Object.keys(row).length === 0) return true;
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("events").update(row).eq("id", eventId);
  if (error) {
    if (/open_link|capacity/i.test(error.message)) return false;
    throw new Error(error.message);
  }
  return true;
}

/** Added by hand or Open link, made on first use. Null before the migration. */
export async function systemListId(eventId: string, kind: Exclude<GuestListKind, "file">): Promise<string | null> {
  const admin = createAdminSupabaseClient();
  const found = await admin.from("event_guest_lists").select("id").eq("event_id", eventId).eq("kind", kind).maybeSingle();
  if (found.error) {
    if (/kind|event_guest_lists/i.test(found.error.message)) return null;
    throw new Error(found.error.message);
  }
  if (found.data) return String((found.data as { id: string }).id);
  const created = await admin
    .from("event_guest_lists")
    .insert({ event_id: eventId, name: SYSTEM_LIST_NAME[kind], kind })
    .select("id")
    .single();
  if (!created.error && created.data) return String((created.data as { id: string }).id);
  const raced = await admin.from("event_guest_lists").select("id").eq("event_id", eventId).eq("kind", kind).maybeSingle();
  if (raced.error || !raced.data) return null;
  return String((raced.data as { id: string }).id);
}

/**
 * A registration wears a pass when its guest sits on a list other than Open link,
 * or has a guest row and no list. Open link has none, and so does a registration with no guest.
 * If the lists cannot be read, every id stays a pass.
 */
export async function namedPassIds(registrationIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(registrationIds.filter(Boolean))];
  if (ids.length === 0) return new Set();
  const all = () => new Set(ids);
  const admin = createAdminSupabaseClient();
  const guests = await admin.from("event_guests").select("id, registration_id").in("registration_id", ids);
  if (guests.error) {
    if (/event_guests|registration_id|relation|schema/i.test(guests.error.message)) return all();
    throw new Error(guests.error.message);
  }
  const guestRows = (guests.data ?? []) as { id: string; registration_id: string }[];
  if (guestRows.length === 0) return new Set();
  const members = await admin
    .from("event_guest_list_members")
    .select("guest_id, list_id")
    .in(
      "guest_id",
      guestRows.map((guest) => guest.id),
    );
  if (members.error) {
    if (/event_guest_list_members|relation|schema/i.test(members.error.message)) return all();
    throw new Error(members.error.message);
  }
  const memberRows = (members.data ?? []) as { guest_id: string; list_id: string }[];
  const listedGuests = new Set(memberRows.map((member) => member.guest_id));
  let namedGuests = new Set<string>();
  if (memberRows.length > 0) {
    const lists = await admin
      .from("event_guest_lists")
      .select("id, kind")
      .in("id", [...new Set(memberRows.map((member) => member.list_id))]);
    if (lists.error) {
      if (/kind|event_guest_lists|relation|schema/i.test(lists.error.message)) return all();
      throw new Error(lists.error.message);
    }
    const namedLists = new Set(
      ((lists.data ?? []) as { id: string; kind: string | null }[])
        .filter((list) => list.kind !== "open")
        .map((list) => list.id),
    );
    namedGuests = new Set(memberRows.filter((member) => namedLists.has(member.list_id)).map((member) => member.guest_id));
  }
  const named = new Set<string>();
  for (const guest of guestRows) {
    if (!listedGuests.has(guest.id) || namedGuests.has(guest.id)) named.add(guest.registration_id);
  }
  return named;
}

/**
 * A registration from the open link that found no list guest by its contact
 * becomes one, in the Open link list. A registration already on a list keeps it.
 */
export async function ensureOpenLinkGuest(
  eventId: string,
  registrationId: string,
  person: { name: string; email: string | null; phone: string | null },
): Promise<void> {
  try {
    if (!person.email && !person.phone) return;
    const admin = createAdminSupabaseClient();
    const linked = await admin.from("event_guests").select("id").eq("registration_id", registrationId).maybeSingle();
    if (linked.error) return;
    const listId = await systemListId(eventId, "open");
    if (!listId) return;
    let guestId = (linked.data as { id: string } | null)?.id ?? null;
    if (!guestId) {
      const inserted = await admin
        .from("event_guests")
        .insert({
          event_id: eventId,
          name: person.name.replace(/\s+/g, " ").trim().slice(0, 200) || "Guest",
          email: person.email?.toLowerCase() ?? null,
          phone: person.email ? null : person.phone,
          token: nanoid(21),
          registration_id: registrationId,
        })
        .select("id")
        .single();
      if (inserted.error || !inserted.data) return;
      guestId = String((inserted.data as { id: string }).id);
      await admin.from("event_guests").update({ accepted_at: new Date().toISOString() }).eq("id", guestId);
    } else {
      const lists = await admin.from("event_guest_list_members").select("list_id").eq("guest_id", guestId).limit(1);
      if ((lists.data ?? []).length > 0) return;
    }
    await admin
      .from("event_guest_list_members")
      .upsert({ guest_id: guestId, list_id: listId }, { onConflict: "guest_id,list_id", ignoreDuplicates: true });
  } catch (error) {
    console.error("[events] open link guest", error);
  }
}
