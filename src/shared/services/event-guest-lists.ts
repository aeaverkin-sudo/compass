import { nanoid } from "nanoid";
import type { BookGuest, BookList, GuestBook, GuestListReport, GuestStatus, NamePair, PairSide } from "@/shared/event/guest-book";
import { isGoing } from "@/shared/event/guest-book";
import {
  fullerPhone,
  listNameFromFile,
  nameKey,
  phoneDigits,
  phonesMatch,
  PHONE_TAIL_DIGITS,
  type GuestImport,
} from "@/shared/event/guest-import";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { isUuid } from "@/shared/services/attachment-api";
import { listEventGuests, loadManageEvent, type EventGuest } from "@/shared/services/event-manage";
import { SYSTEM_LIST_NAME, systemListId, type GuestListKind } from "@/shared/services/event-open-link";

const PAGE = 1000;
const MIGRATION = "Guest lists need the guest-lists migration.";
const CABINET_MIGRATION = "Adding by hand needs the event cabinet migration.";
const SYSTEM_LIST = "This list can't be renamed or removed.";
const TABLES = /event_guest_lists|event_guests|event_guest_list_members|event_guest_kept_pairs/i;

type Failure = { ok: false; status: number; error: string };
type Call<T = object> = ({ ok: true } & T) | Failure;

type GuestRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  token: string;
  sent_at: string | null;
  opened_at: string | null;
  registration_id: string | null;
  created_at: string | null;
  /** Copied from the registration before a pass account is deleted. */
  checked_in_at?: string | null;
  paid_status?: string | null;
  paid_source?: string | null;
};
type ListRow = { id: string; name: string; is_paid: boolean; created_at: string | null; kind?: string | null };
type MemberRow = { guest_id: string; list_id: string };
type PairRow = { guest_a: string; guest_b: string };

type Page = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

class MissingTables extends Error {}

function isMissing(message: string): boolean {
  return TABLES.test(message) && /relation|schema|table|find|exist/i.test(message);
}

function fail(error: { message: string }): never {
  if (isMissing(error.message)) throw new MissingTables(error.message);
  throw new Error(error.message);
}

async function allRows<T>(page: (from: number, to: number) => Page): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) fail(error);
    const chunk = (data ?? []) as T[];
    rows.push(...chunk);
    if (chunk.length < PAGE) return rows;
  }
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

async function access(lookup: string, actorId: string): Promise<{ ok: true; eventId: string } | Failure> {
  const loaded = await loadManageEvent(lookup, actorId, "guests");
  if (loaded.kind !== "ok") {
    return { ok: false, status: loaded.kind === "missing" ? 404 : 403, error: loaded.kind === "missing" ? "Event not found" : "Not allowed" };
  }
  return { ok: true, eventId: loaded.event.id };
}

async function guarded<T extends object>(run: () => Promise<Call<T>>): Promise<Call<T>> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof MissingTables) return { ok: false, status: 409, error: MIGRATION };
    throw error;
  }
}

const GUEST_BASE = "id, name, email, phone, token, sent_at, opened_at, registration_id, created_at";
const GUEST_KEPT = "checked_in_at, paid_status, paid_source";

async function readGuests(eventId: string): Promise<GuestRow[]> {
  const admin = createAdminSupabaseClient();
  const page = (select: string) => (from: number, to: number) =>
    admin
      .from("event_guests")
      .select(select)
      .eq("event_id", eventId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
  try {
    return await allRows<GuestRow>(page(`${GUEST_BASE}, ${GUEST_KEPT}`));
  } catch (error) {
    if (!(error instanceof Error) || !/checked_in_at|paid_status|paid_source/i.test(error.message)) throw error;
    return allRows<GuestRow>(page(GUEST_BASE));
  }
}

async function readLists(eventId: string): Promise<ListRow[]> {
  const admin = createAdminSupabaseClient();
  const page = (select: string) => (from: number, to: number) =>
    admin.from("event_guest_lists").select(select).eq("event_id", eventId).order("created_at", { ascending: true }).range(from, to);
  try {
    return await allRows<ListRow>(page("id, name, is_paid, created_at, kind"));
  } catch (error) {
    if (!(error instanceof Error) || !/kind/i.test(error.message)) throw error;
    return allRows<ListRow>(page("id, name, is_paid, created_at"));
  }
}

function kindOf(list: ListRow): GuestListKind {
  return list.kind === "manual" || list.kind === "open" ? list.kind : "file";
}

const KIND_ORDER: Record<GuestListKind, number> = { file: 0, manual: 1, open: 2 };

async function readMembers(listIds: string[]): Promise<MemberRow[]> {
  if (listIds.length === 0) return [];
  const admin = createAdminSupabaseClient();
  return allRows<MemberRow>((from, to) =>
    admin.from("event_guest_list_members").select("guest_id, list_id").in("list_id", listIds).order("guest_id").range(from, to),
  );
}

async function readKept(eventId: string): Promise<PairRow[]> {
  const admin = createAdminSupabaseClient();
  return allRows<PairRow>((from, to) =>
    admin.from("event_guest_kept_pairs").select("guest_a, guest_b").eq("event_id", eventId).range(from, to),
  );
}

/** Phone lookup by the last digits, so a number with and without a country code meet. */
function phoneIndex(guests: { id: string; phone: string | null }[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const guest of guests) {
    if (!guest.phone) continue;
    const key = phoneDigits(guest.phone).slice(-PHONE_TAIL_DIGITS);
    index.set(key, [...(index.get(key) ?? []), guest.id]);
  }
  return index;
}

type Pool = {
  byId: Map<string, GuestRow>;
  byEmail: Map<string, string>;
  byPhone: Map<string, string[]>;
};

function poolOf(guests: GuestRow[]): Pool {
  return {
    byId: new Map(guests.map((guest) => [guest.id, guest])),
    byEmail: new Map(guests.filter((guest) => guest.email).map((guest) => [guest.email as string, guest.id])),
    byPhone: phoneIndex(guests),
  };
}

function findByPhone(pool: Pool, phone: string): string | null {
  const key = phoneDigits(phone).slice(-PHONE_TAIL_DIGITS);
  for (const id of pool.byPhone.get(key) ?? []) {
    const other = pool.byId.get(id)?.phone;
    if (other && phonesMatch(other, phone)) return id;
  }
  return null;
}

function remember(pool: Pool, guest: GuestRow) {
  pool.byId.set(guest.id, guest);
  if (guest.email) pool.byEmail.set(guest.email, guest.id);
  if (guest.phone) {
    const key = phoneDigits(guest.phone).slice(-PHONE_TAIL_DIGITS);
    const ids = pool.byPhone.get(key) ?? [];
    if (!ids.includes(guest.id)) pool.byPhone.set(key, [...ids, guest.id]);
  }
}

async function registrantEmails(userIds: string[]): Promise<Map<string, string>> {
  const admin = createAdminSupabaseClient();
  const emails = new Map<string, string>();
  for (const batch of chunks(userIds, 10)) {
    await Promise.all(
      batch.map(async (userId) => {
        const user = await admin.auth.admin.getUserById(userId);
        const email = user.data.user?.email?.trim().toLowerCase();
        if (email) emails.set(userId, email);
      }),
    );
  }
  return emails;
}

/** A list guest whose email signed up through the shared link is Going. */
async function linkRegistrations(eventId: string, guests: GuestRow[]): Promise<void> {
  const open = guests.filter((guest) => guest.email && !guest.registration_id);
  if (open.length === 0) return;
  const admin = createAdminSupabaseClient();
  const regs = await admin.from("event_registrations").select("id, user_id").eq("event_id", eventId);
  if (regs.error) throw new Error(regs.error.message);
  const taken = new Set(guests.map((guest) => guest.registration_id).filter(Boolean));
  const free = ((regs.data ?? []) as { id: string; user_id: string }[]).filter((row) => !taken.has(row.id));
  if (free.length === 0) return;
  const emails = await registrantEmails(free.map((row) => row.user_id));
  const byEmail = new Map<string, string>();
  for (const row of free) {
    const email = emails.get(row.user_id);
    if (email && !byEmail.has(email)) byEmail.set(email, row.id);
  }
  for (const guest of open) {
    const registrationId = byEmail.get(guest.email as string);
    if (!registrationId) continue;
    byEmail.delete(guest.email as string);
    const linked = await admin.from("event_guests").update({ registration_id: registrationId }).eq("id", guest.id);
    if (linked.error) fail(linked.error);
    guest.registration_id = registrationId;
  }
}

/** One uploaded table becomes a list. Known people get a membership and any missing contact. */
export async function importGuestList(
  lookup: string,
  actorId: string,
  fileName: string,
  parsed: GuestImport,
): Promise<Call<{ report: GuestListReport }>> {
  const allowed = await access(lookup, actorId);
  if (!allowed.ok) return allowed;
  const eventId = allowed.eventId;
  return guarded(async () => {
    const admin = createAdminSupabaseClient();
    const name = listNameFromFile(fileName);
    const created = await admin
      .from("event_guest_lists")
      .insert({ event_id: eventId, name, file_name: fileName.slice(0, 200), row_count: parsed.rows, created_by: actorId })
      .select("id")
      .single();
    if (created.error || !created.data) fail(created.error ?? { message: "Could not create the list." });
    const listId = String((created.data as { id: string }).id);
    const { added, merged } = await mergeIntoList(eventId, listId, parsed);
    return {
      ok: true,
      report: { listId, name, added, merged, rows: parsed.rows, skipped: parsed.skipped },
    };
  });
}

/** Guests typed or pasted in the cabinet go to Added by hand, merged like a file. */
export async function addGuestsByHand(lookup: string, actorId: string, parsed: GuestImport): Promise<Call<{ report: GuestListReport }>> {
  const allowed = await access(lookup, actorId);
  if (!allowed.ok) return allowed;
  const eventId = allowed.eventId;
  return guarded<{ report: GuestListReport }>(async () => {
    const listId = await systemListId(eventId, "manual");
    if (!listId) return { ok: false, status: 409, error: CABINET_MIGRATION };
    const { added, merged } = await mergeIntoList(eventId, listId, parsed);
    return {
      ok: true,
      report: { listId, name: SYSTEM_LIST_NAME.manual, added, merged, rows: parsed.rows, skipped: parsed.skipped },
    };
  });
}

async function mergeIntoList(eventId: string, listId: string, parsed: GuestImport): Promise<{ added: number; merged: number }> {
  const admin = createAdminSupabaseClient();
  const existing = await readGuests(eventId);
  const pool = poolOf(existing);

  const fresh: GuestRow[] = [];
  const freshIds = new Set<string>();
  const changed = new Map<string, Partial<GuestRow>>();
  const members = new Set<string>();
  let merged = 0;

  for (const person of parsed.guests) {
    const matchId = (person.email ? pool.byEmail.get(person.email) : undefined) ?? (person.phone ? findByPhone(pool, person.phone) : null);
    if (!matchId) {
      const guest: GuestRow = {
        id: crypto.randomUUID(),
        name: person.name.slice(0, 200),
        email: person.email,
        phone: person.phone,
        token: nanoid(21),
        sent_at: null,
        opened_at: null,
        registration_id: null,
        created_at: null,
      };
      fresh.push(guest);
      freshIds.add(guest.id);
      remember(pool, guest);
      members.add(guest.id);
      continue;
    }

    const guest = pool.byId.get(matchId) as GuestRow;
    if (!members.has(matchId) && !freshIds.has(matchId)) merged += 1;
    members.add(matchId);
    const patch: Partial<GuestRow> = {};
    if (!guest.email && person.email && !pool.byEmail.has(person.email)) patch.email = person.email;
    if (person.phone) {
      if (!guest.phone && !findByPhone(pool, person.phone)) patch.phone = person.phone;
      else if (guest.phone && phonesMatch(guest.phone, person.phone)) {
        const fuller = fullerPhone(guest.phone, person.phone);
        if (fuller !== guest.phone) patch.phone = fuller;
      }
    }
    if (Object.keys(patch).length === 0) continue;
    Object.assign(guest, patch);
    remember(pool, guest);
    if (freshIds.has(matchId)) continue;
    changed.set(matchId, { ...(changed.get(matchId) ?? {}), ...patch });
  }

  for (const batch of chunks(fresh, 500)) {
    const inserted = await admin.from("event_guests").insert(
      batch.map((guest) => ({ id: guest.id, event_id: eventId, name: guest.name, email: guest.email, phone: guest.phone, token: guest.token })),
    );
    if (inserted.error) fail(inserted.error);
  }
  for (const batch of chunks([...changed], 10)) {
    await Promise.all(
      batch.map(async ([id, patch]) => {
        const updated = await admin.from("event_guests").update(patch).eq("id", id).eq("event_id", eventId);
        if (updated.error) fail(updated.error);
      }),
    );
  }
  for (const batch of chunks([...members], 500)) {
    const linked = await admin
      .from("event_guest_list_members")
      .upsert(batch.map((guestId) => ({ guest_id: guestId, list_id: listId })), { onConflict: "guest_id,list_id", ignoreDuplicates: true });
    if (linked.error) fail(linked.error);
  }

  await linkRegistrations(eventId, [...pool.byId.values()]);
  return { added: fresh.length, merged };
}

/** The list's kind, or null when it is not this event's. */
async function ownList(eventId: string, listId: string): Promise<GuestListKind | null> {
  if (!isUuid(listId)) return null;
  const lists = await readLists(eventId);
  const list = lists.find((row) => row.id === listId);
  return list ? kindOf(list) : null;
}

export async function updateGuestList(
  lookup: string,
  actorId: string,
  listId: string,
  patch: { name?: string; isPaid?: boolean },
): Promise<Call> {
  const allowed = await access(lookup, actorId);
  if (!allowed.ok) return allowed;
  return guarded(async () => {
    const kind = await ownList(allowed.eventId, listId);
    if (!kind) return { ok: false, status: 404, error: "List not found" };
    const row: { name?: string; is_paid?: boolean } = {};
    if (typeof patch.name === "string") {
      if (kind !== "file") return { ok: false, status: 400, error: SYSTEM_LIST };
      const name = patch.name.replace(/\s+/g, " ").trim().slice(0, 80);
      if (!name) return { ok: false, status: 400, error: "Name the list." };
      row.name = name;
    }
    if (typeof patch.isPaid === "boolean") row.is_paid = patch.isPaid;
    if (Object.keys(row).length === 0) return { ok: true };
    const admin = createAdminSupabaseClient();
    const updated = await admin.from("event_guest_lists").update(row).eq("id", listId).eq("event_id", allowed.eventId);
    if (updated.error) fail(updated.error);
    return { ok: true };
  });
}

/** Drops the memberships. A guest left in no list and not registered goes too. */
export async function deleteGuestList(lookup: string, actorId: string, listId: string): Promise<Call> {
  const allowed = await access(lookup, actorId);
  if (!allowed.ok) return allowed;
  return guarded(async () => {
    const eventId = allowed.eventId;
    const kind = await ownList(eventId, listId);
    if (!kind) return { ok: false, status: 404, error: "List not found" };
    if (kind !== "file") return { ok: false, status: 400, error: SYSTEM_LIST };
    const admin = createAdminSupabaseClient();
    const touched = (await readMembers([listId])).map((row) => row.guest_id);
    const removed = await admin.from("event_guest_lists").delete().eq("id", listId).eq("event_id", eventId);
    if (removed.error) fail(removed.error);
    if (touched.length === 0) return { ok: true };

    const kept = new Set<string>();
    const registered = new Set<string>();
    for (const batch of chunks(touched, 300)) {
      const still = await admin.from("event_guest_list_members").select("guest_id").in("guest_id", batch);
      if (still.error) fail(still.error);
      for (const row of (still.data ?? []) as { guest_id: string }[]) kept.add(row.guest_id);
      const linked = await admin.from("event_guests").select("id").in("id", batch).not("registration_id", "is", null);
      if (linked.error) fail(linked.error);
      for (const row of (linked.data ?? []) as { id: string }[]) registered.add(row.id);
    }
    const orphans = touched.filter((id) => !kept.has(id) && !registered.has(id));
    for (const batch of chunks(orphans, 300)) {
      const gone = await admin.from("event_guests").delete().eq("event_id", eventId).in("id", batch);
      if (gone.error) fail(gone.error);
    }
    return { ok: true };
  });
}

/** Two guests with one name: merge into the first, or remember to keep them apart. */
export async function resolveNamePair(
  lookup: string,
  actorId: string,
  firstId: string,
  secondId: string,
  action: "merge" | "keep",
): Promise<Call> {
  const allowed = await access(lookup, actorId);
  if (!allowed.ok) return allowed;
  if (!isUuid(firstId) || !isUuid(secondId) || firstId === secondId) return { ok: false, status: 400, error: "Pick two guests." };
  return guarded(async () => {
    const eventId = allowed.eventId;
    const admin = createAdminSupabaseClient();
    const read = await admin
      .from("event_guests")
      .select("id, name, email, phone, token, sent_at, opened_at, registration_id, created_at")
      .eq("event_id", eventId)
      .in("id", [firstId, secondId]);
    if (read.error) fail(read.error);
    const rows = ((read.data ?? []) as GuestRow[]).sort(
      (a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) || a.id.localeCompare(b.id),
    );
    if (rows.length !== 2) return { ok: false, status: 404, error: "Guest not found" };

    if (action === "keep") {
      const [guestA, guestB] = [rows[0].id, rows[1].id].sort();
      const kept = await admin
        .from("event_guest_kept_pairs")
        .upsert({ event_id: eventId, guest_a: guestA, guest_b: guestB }, { onConflict: "guest_a,guest_b", ignoreDuplicates: true });
      if (kept.error) fail(kept.error);
      return { ok: true };
    }

    const [keep, drop] = rows;
    if (keep.registration_id && drop.registration_id) {
      return { ok: false, status: 409, error: "Both guests are registered. Keep both." };
    }
    const lists = await readMembersOf(drop.id);
    if (lists.length > 0) {
      const moved = await admin
        .from("event_guest_list_members")
        .upsert(lists.map((listId) => ({ guest_id: keep.id, list_id: listId })), { onConflict: "guest_id,list_id", ignoreDuplicates: true });
      if (moved.error) fail(moved.error);
    }
    const patch: Partial<GuestRow> = {};
    if (!keep.email && drop.email) patch.email = drop.email;
    if (!keep.phone && drop.phone) patch.phone = drop.phone;
    if (!keep.registration_id && drop.registration_id) patch.registration_id = drop.registration_id;
    if (!keep.sent_at && drop.sent_at) patch.sent_at = drop.sent_at;
    if (!keep.opened_at && drop.opened_at) patch.opened_at = drop.opened_at;
    const gone = await admin.from("event_guests").delete().eq("id", drop.id).eq("event_id", eventId);
    if (gone.error) fail(gone.error);
    if (Object.keys(patch).length > 0) {
      const updated = await admin.from("event_guests").update(patch).eq("id", keep.id).eq("event_id", eventId);
      if (updated.error) fail(updated.error);
    }
    return { ok: true };
  });
}

async function readMembersOf(guestId: string): Promise<string[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("event_guest_list_members").select("list_id").eq("guest_id", guestId);
  if (error) fail(error);
  return ((data ?? []) as { list_id: string }[]).map((row) => row.list_id);
}

function keptPaid(value: string | null | undefined): BookGuest["paidStatus"] {
  return value === "paid" || value === "unpaid" ? value : null;
}

function keptSource(value: string | null | undefined): BookGuest["paidSource"] {
  return value === "return" || value === "statement" || value === "manual" || value === "name" || value === "list" ? value : null;
}

function listStatus(guest: GuestRow, registration: EventGuest | undefined): GuestStatus {
  if (registration) return registration.checkedIn ? "in" : "going";
  if (guest.checked_in_at) return "in";
  if (guest.paid_status) return "going";
  if (guest.opened_at) return "opened";
  if (guest.sent_at) return "sent";
  return "not_sent";
}

/** A shared-link registration that is on no list. */
export function registrationGuest(reg: EventGuest): BookGuest {
  return {
    key: `r:${reg.id}`,
    guestId: null,
    registrationId: reg.id,
    userId: reg.userId,
    name: reg.name,
    email: null,
    phone: null,
    token: null,
    listIds: [],
    paidList: false,
    status: reg.checkedIn ? "in" : "going",
    sent: false,
    opened: false,
    photoUrl: reg.photoUrl,
    cardToken: reg.cardToken,
    paidStatus: reg.paidStatus,
    paidSource: reg.paidSource,
    registeredAt: reg.registeredAt,
    addedAt: reg.registeredAt,
  };
}

function contactOf(guest: { email: string | null; phone: string | null }): string {
  return guest.email ?? guest.phone ?? "";
}

/**
 * Lists, their guests, and shared-link registrations as one book.
 * Null until the guest-lists migration has run.
 */
export async function loadGuestBook(eventId: string, registrations?: EventGuest[]): Promise<GuestBook | null> {
  try {
    const [lists, guests, kept, regs] = await Promise.all([
      readLists(eventId),
      readGuests(eventId),
      readKept(eventId),
      registrations ? Promise.resolve(registrations) : listEventGuests(eventId).then((list) => list.guests),
    ]);
    const members = await readMembers(lists.map((list) => list.id));
    const listsOf = new Map<string, string[]>();
    for (const row of members) listsOf.set(row.guest_id, [...(listsOf.get(row.guest_id) ?? []), row.list_id]);
    const listById = new Map(lists.map((list) => [list.id, list]));
    const regById = new Map(regs.map((reg) => [reg.id, reg]));
    const linked = new Set<string>();

    const book: BookGuest[] = guests.map((guest) => {
      const registration = guest.registration_id ? regById.get(guest.registration_id) : undefined;
      if (registration) linked.add(registration.id);
      const listIds = (listsOf.get(guest.id) ?? []).filter((id) => listById.has(id));
      return {
        key: guest.id,
        guestId: guest.id,
        registrationId: registration?.id ?? null,
        userId: registration?.userId ?? null,
        name: guest.name,
        email: guest.email,
        phone: guest.phone,
        token: guest.token,
        listIds,
        paidList: listIds.some((id) => listById.get(id)?.is_paid),
        status: listStatus(guest, registration),
        sent: Boolean(guest.sent_at),
        opened: Boolean(guest.opened_at),
        photoUrl: registration?.photoUrl ?? null,
        cardToken: registration?.cardToken ?? null,
        paidStatus: registration?.paidStatus ?? keptPaid(guest.paid_status),
        paidSource: registration?.paidSource ?? keptSource(guest.paid_source),
        registeredAt: registration?.registeredAt ?? null,
        addedAt: guest.created_at,
      };
    });
    for (const reg of regs) {
      if (!linked.has(reg.id)) book.push(registrationGuest(reg));
    }
    book.sort((a, b) => a.name.localeCompare(b.name));

    const ordered = [...lists].sort((a, b) => KIND_ORDER[kindOf(a)] - KIND_ORDER[kindOf(b)]);
    const bookLists: BookList[] = ordered.map((list) => {
      const inList = book.filter((guest) => guest.listIds.includes(list.id));
      return {
        id: list.id,
        name: list.name,
        kind: kindOf(list),
        isPaid: list.is_paid,
        total: inList.length,
        email: inList.filter((guest) => guest.email).length,
        phone: inList.filter((guest) => !guest.email && guest.phone).length,
        going: inList.filter((guest) => isGoing(guest.status)).length,
        preview: inList.slice(0, 3).map((guest) => ({ key: guest.key, name: guest.name, status: guest.status })),
      };
    });

    const keptPairs = new Set(kept.map((pair) => `${pair.guest_a}|${pair.guest_b}`));
    const side = (guest: BookGuest): PairSide => ({
      id: guest.guestId as string,
      name: guest.name,
      contact: contactOf(guest),
      lists: guest.listIds.map((id) => listById.get(id)?.name ?? "").filter(Boolean).join(", "),
    });
    const byName = new Map<string, BookGuest[]>();
    for (const guest of book) {
      if (!guest.guestId) continue;
      const key = nameKey(guest.name);
      byName.set(key, [...(byName.get(key) ?? []), guest]);
    }
    const pairs: NamePair[] = [];
    for (const group of byName.values()) {
      for (let i = 0; i < group.length; i += 1) {
        for (let j = i + 1; j < group.length; j += 1) {
          const [left, right] = [group[i], group[j]].sort((a, b) => (a.guestId as string).localeCompare(b.guestId as string));
          if (keptPairs.has(`${left.guestId}|${right.guestId}`)) continue;
          if (left.registrationId && right.registrationId) continue;
          pairs.push({ a: side(left), b: side(right) });
        }
      }
    }

    return {
      lists: bookLists,
      guests: book,
      pairs,
      passes: book
        .filter((guest) => guest.token && guest.phone && !guest.email)
        .map((guest) => ({ name: guest.name, token: guest.token as string })),
      total: book.length,
      going: book.filter((guest) => isGoing(guest.status)).length,
      checkedIn: book.filter((guest) => guest.status === "in").length,
    };
  } catch (error) {
    if (error instanceof MissingTables) return null;
    throw error;
  }
}
