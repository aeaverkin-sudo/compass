import { randomUUID } from "node:crypto";
import { nanoid } from "nanoid";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { CONSENT_VERSION } from "@/shared/services/consent";
import { userIdForEmail } from "@/shared/services/email-signup";
import { findPassGuest, passCardName, type PassGuest } from "@/shared/services/event-guest-pass";
import { loadEventInvite, type EventInvite } from "@/shared/services/event-invite";
import { listOwnPortfolios, loadOwnRegistration, registerForEvent } from "@/shared/services/event-registration";
import { eventListStatus } from "@/shared/services/events";
import { loadEventPay } from "@/shared/services/event-payment";
import { payView } from "@/shared/event/payment-label";
import { eventGuestEnd, startEventGuestClock } from "@/shared/services/trial";
import { sendPassLink } from "@/shared/services/mail";
import { holderOfContact, passAllowed, recordPass, TRY_LATER } from "@/shared/services/event-pass-guard";
import { loadEventSeats, SOLD_OUT } from "@/shared/services/event-seats";

export type SessionUser = { id: string; anonymous: boolean } | null;

export type GuestAcceptResult =
  /** Leave for this path. A notice is shown first. */
  | { ok: true; kind: "go"; next: string; notice?: string }
  /** This browser already holds the guest's account. A new email still waits for its confirmation. */
  | { ok: true; kind: "here"; cardId: string | null; confirmEmail?: string; pay?: boolean }
  /** The browser signs in as the guest with this one-time hash. Pay: the payment screen comes before the pass. */
  | { ok: true; kind: "signin"; tokenHash: string; cardId: string | null; pay?: boolean }
  /** A phone-only guest on a device that never held the pass. */
  | { ok: true; kind: "other-device" }
  /** Nothing to open here. The line says what happens next. */
  | { ok: true; kind: "notice"; text: string }
  | { ok: false; status: number; error: string };

export const TAKEN_EMAIL = "This email already has an ADED profile";

type AccountKind = { registered: boolean; eventTrial: boolean };

type PassPerson = { name: string; email: string | null; phone: string | null };

async function accountKind(userId: string): Promise<AccountKind> {
  const admin = createAdminSupabaseClient();
  const full = await admin.from("profiles").select("registered_at, event_trial").eq("id", userId).maybeSingle();
  if (!full.error) {
    const row = full.data as { registered_at: string | null; event_trial: boolean | null } | null;
    return { registered: Boolean(row?.registered_at), eventTrial: row?.event_trial === true };
  }
  if (!/event_trial/i.test(full.error.message)) throw new Error(full.error.message);
  const kept = await admin.from("profiles").select("registered_at").eq("id", userId).maybeSingle();
  if (kept.error) throw new Error(kept.error.message);
  return { registered: Boolean((kept.data as { registered_at: string | null } | null)?.registered_at), eventTrial: false };
}

/** The token may sign in only while the account is an unkept event pass. */
function isPassAccount(kind: AccountKind): boolean {
  return kind.eventTrial && !kind.registered;
}

/** A registered account that is not a trial or an event pass. */
export async function isPermanentAccount(session: SessionUser): Promise<boolean> {
  if (!session || session.anonymous) return false;
  const kind = await accountKind(session.id);
  return kind.registered && !kind.eventTrial;
}

/** The session already holds a pass on this event. */
export async function holdsEventPass(session: SessionUser, eventId: string): Promise<boolean> {
  if (!session) return false;
  if (!isPassAccount(await accountKind(session.id))) return false;
  return Boolean(await loadOwnRegistration(eventId, session.id));
}

function invitePath(event: EventInvite, token: string | null): string {
  const base = `/e/${encodeURIComponent(event.slug ?? event.code)}`;
  return token ? `${base}?g=${token}&go=1` : `${base}/join`;
}

function signInPath(next: string): string {
  return `/register?signin=1&next=${encodeURIComponent(next)}`;
}

/** Set once the account has its own password. From then on only the password signs in. */
export const PASSWORD_SET = "password_set_at";

async function magicHash(userId: string): Promise<string | "password" | null> {
  const admin = createAdminSupabaseClient();
  const loaded = await admin.auth.admin.getUserById(userId);
  if (loaded.data.user?.app_metadata?.[PASSWORD_SET]) return "password";
  const email = loaded.data.user?.email?.trim().toLowerCase();
  if (!email) return null;
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw new Error(link.error.message);
  return link.data.properties?.hashed_token ?? null;
}

async function authUser(userId: string) {
  const admin = createAdminSupabaseClient();
  return (await admin.auth.admin.getUserById(userId)).data.user ?? null;
}

async function hasPassword(userId: string): Promise<boolean> {
  return Boolean((await authUser(userId))?.app_metadata?.[PASSWORD_SET]);
}

/** The account's own confirmed address, not one only typed on a card. */
async function ownsEmail(userId: string, email: string): Promise<boolean> {
  return (await authUser(userId))?.email?.trim().toLowerCase() === email;
}

export const PHONE_HAS_PASS = "This phone already has a pass. Open it on the device you used first.";

/**
 * The open link, the same email on another device: the pass is issued to that
 * account and the sign-in goes to the address. Whoever reads the mail gets in.
 * The mail counts in the open link limit.
 */
async function mailPassLink(
  userId: string,
  person: PassPerson & { email: string },
  event: EventInvite,
  lookup: string,
  timeZone: unknown,
  guard: { ip: string; origin: string },
): Promise<GuestAcceptResult> {
  if (!(await passAllowed(event.id, guard.ip))) return { ok: false, status: 429, error: TRY_LATER };
  const fresh = !(await loadOwnRegistration(event.id, userId));
  if (fresh && (await loadEventSeats(event.id)).soldOut) return { ok: false, status: 409, error: SOLD_OUT };
  const issued = await issuePass(userId, person, event, lookup, null, validTimeZone(timeZone));
  if (!issued.ok) return issued;
  const tokenHash = await magicHash(userId);
  if (!tokenHash || tokenHash === "password") return { ok: true, kind: "notice", text: PHONE_HAS_PASS };
  const slug = encodeURIComponent(event.slug ?? event.code);
  const link = `${guard.origin}/e/${slug}/enter?t=${encodeURIComponent(tokenHash)}${issued.pay ? "&pay=1" : ""}`;
  await sendPassLink(person.email, event.name.replace(/\s+/g, " ").trim(), link);
  await recordPass(event.id, guard.ip);
  return { ok: true, kind: "notice", text: `We sent a link to ${person.email} — open it to get your pass.` };
}

async function createEmailGuest(email: string): Promise<string> {
  const admin = createAdminSupabaseClient();
  const created = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { event_trial: true } });
  if (created.data.user) return created.data.user.id;
  const raced = await userIdForEmail(email);
  if (raced) return raced;
  throw new Error(created.error?.message ?? "Could not create the guest.");
}

function validTimeZone(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 1 || value.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value });
    return value;
  } catch {
    return null;
  }
}

/** The pass account remembers its device time zone, for the dates in the deletion mail. */
async function markPassAccount(userId: string, timeZone: string | null): Promise<void> {
  const admin = createAdminSupabaseClient();
  const loaded = await admin.auth.admin.getUserById(userId);
  const user = loaded.data.user;
  if (!user) return;
  const marked = user.app_metadata?.event_trial === true;
  const zoned = !timeZone || user.user_metadata?.time_zone === timeZone;
  if (marked && zoned) return;
  const updated = await admin.auth.admin.updateUserById(userId, {
    ...(marked ? {} : { app_metadata: { ...user.app_metadata, event_trial: true } }),
    ...(zoned ? {} : { user_metadata: { ...user.user_metadata, time_zone: timeZone } }),
  });
  if (updated.error) throw new Error(updated.error.message);
}

/** First section Event with the event name, then Contact. No photo. */
async function createPassCard(userId: string, person: PassPerson, event: EventInvite): Promise<string> {
  const admin = createAdminSupabaseClient();
  const cardId = randomUUID();
  const eventItemId = randomUUID();
  const contactItemId = randomUUID();
  const now = new Date().toISOString();
  const contact = person.email
    ? { type: "email", value: person.email, url: `mailto:${person.email}` }
    : { type: "phone", value: person.phone ?? "", url: `tel:${(person.phone ?? "").replace(/\s/g, "")}` };

  const items = await admin.from("items").insert([
    { id: eventItemId, owner_id: userId, type: "text", label: "", value: event.name.replace(/\s+/g, " ").trim(), url: "" },
    { id: contactItemId, owner_id: userId, ...contact, label: "" },
  ]);
  if (items.error) throw new Error(items.error.message);

  const card = await admin.from("cards").insert({
    id: cardId,
    owner_id: userId,
    display_name: passCardName(person.name),
    title: "",
    status: "draft",
    public_token: nanoid(21),
    qr_version: 1,
    is_public: true,
    listed: true,
    rubric_order: ["additional", "contact"],
    rubric_labels: { additional: "Event" },
    item_zones: { [eventItemId]: "additional" },
    created_at: now,
    updated_at: now,
  });
  if (card.error) throw new Error(card.error.message);

  const links = await admin.from("card_items").insert([
    { card_id: cardId, item_id: eventItemId, sort_order: 0, visible: true },
    { card_id: cardId, item_id: contactItemId, sort_order: 1, visible: true },
  ]);
  if (links.error) throw new Error(links.error.message);
  return cardId;
}

/** A guest of a second event keeps the card of the first one. */
async function existingPassCard(userId: string): Promise<string | null> {
  const admin = createAdminSupabaseClient();
  const regs = await admin.from("event_registrations").select("card_id").eq("user_id", userId).order("created_at", { ascending: true });
  if (regs.error) throw new Error(regs.error.message);
  const ids = [...new Set(((regs.data ?? []) as { card_id: string }[]).map((row) => row.card_id))];
  if (ids.length === 0) return null;
  const cards = await admin.from("cards").select("id").eq("owner_id", userId).in("id", ids);
  if (cards.error) throw new Error(cards.error.message);
  const owned = new Set(((cards.data ?? []) as { id: string }[]).map((row) => row.id));
  return ids.find((id) => owned.has(id)) ?? null;
}

/** Row 01 Event names the nearest event still ahead. After the last one, the latest. */
async function refreshPassEventRow(userId: string, cardId: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  const regs = await admin.from("event_registrations").select("event_id").eq("user_id", userId);
  if (regs.error) throw new Error(regs.error.message);
  const eventIds = [...new Set(((regs.data ?? []) as { event_id: string }[]).map((row) => row.event_id))];
  if (eventIds.length < 2) return;
  const full = await admin.from("events").select("id, name, date, ends_at").in("id", eventIds);
  const loaded =
    full.error && /ends_at/i.test(full.error.message) ? await admin.from("events").select("id, name, date").in("id", eventIds) : full;
  if (loaded.error) throw new Error(loaded.error.message);
  const now = Date.now();
  const rows = (loaded.data ?? []) as { name: string; date: string | null; ends_at?: string | null }[];
  const timed = rows.map((row) => ({ name: row.name, end: eventGuestEnd({ date: row.date, endsAt: row.ends_at ?? null }, now) }));
  const ahead = timed.filter((row) => row.end > now).sort((left, right) => left.end - right.end);
  const pick = ahead[0] ?? timed.sort((left, right) => right.end - left.end)[0];
  if (!pick) return;

  const card = await admin.from("cards").select("item_zones").eq("id", cardId).maybeSingle();
  if (card.error) throw new Error(card.error.message);
  const zones = ((card.data as { item_zones?: Record<string, string> | null } | null)?.item_zones ?? {}) as Record<string, string>;
  const eventItemId = Object.keys(zones).find((id) => zones[id] === "additional");
  if (!eventItemId) return;
  const updated = await admin
    .from("items")
    .update({ value: pick.name.replace(/\s+/g, " ").trim() })
    .eq("id", eventItemId)
    .eq("owner_id", userId);
  if (updated.error) throw new Error(updated.error.message);
}

async function onPaidList(guestId: string): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const members = await admin.from("event_guest_list_members").select("list_id").eq("guest_id", guestId);
  if (members.error) throw new Error(members.error.message);
  const listIds = ((members.data ?? []) as { list_id: string }[]).map((row) => row.list_id);
  if (listIds.length === 0) return false;
  const paid = await admin.from("event_guest_lists").select("id").in("id", listIds).eq("is_paid", true).limit(1);
  if (paid.error) throw new Error(paid.error.message);
  return (paid.data ?? []).length > 0;
}

async function confirmListPayment(registrationId: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  const marked = await admin
    .from("event_registrations")
    .update({ paid_status: "paid", paid_source: "list" })
    .eq("id", registrationId)
    .or("paid_source.is.null,paid_source.eq.return");
  if (marked.error) console.error("[events] list payment", marked.error.message);
}

/** The event rules, Terms and Privacy behind the asterisk. */
export async function recordEventConsent(userId: string, guestId: string | null): Promise<void> {
  const admin = createAdminSupabaseClient();
  const row = { user_id: userId, document_version: CONSENT_VERSION, path: "event" };
  if (guestId) {
    const full = await admin.from("consents").insert({ ...row, guest_id: guestId });
    if (!full.error) return;
    if (!/guest_id/i.test(full.error.message)) throw new Error(full.error.message);
  }
  const kept = await admin.from("consents").insert(row);
  if (kept.error) throw new Error(kept.error.message);
}

/** The list guest now linked to this registration, by token or by contact. */
async function linkedGuestId(registrationId: string): Promise<string | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("event_guests").select("id").eq("registration_id", registrationId).limit(1);
  if (error) return null;
  return ((data ?? []) as { id: string }[])[0]?.id ?? null;
}

/** Payment from a paid list, then the consent. Neither blocks the pass. */
async function settleRegistration(userId: string, registrationId: string, guestId: string | null): Promise<void> {
  if (guestId && (await onPaidList(guestId))) await confirmListPayment(registrationId);
  try {
    await recordEventConsent(userId, guestId);
  } catch (error) {
    console.error("[events] guest consent", error);
  }
}

/** A paid event shows the payment screen first, unless a paid list has already confirmed it. */
async function paysFirst(eventId: string, userId: string): Promise<boolean> {
  const pay = await loadEventPay(eventId);
  if (!pay.isPaid) return false;
  const registration = await loadOwnRegistration(eventId, userId);
  return payView(registration?.paidStatus ?? "", registration?.paidSource ?? null).key !== "confirmed";
}

async function enterAsPass(userId: string, session: SessionUser, cardId: string | null, pay = false): Promise<GuestAcceptResult> {
  if (session?.id === userId) return { ok: true, kind: "here", cardId, pay };
  const tokenHash = await magicHash(userId);
  if (tokenHash === "password") return { ok: true, kind: "go", next: signInPath("/main") };
  if (tokenHash) return { ok: true, kind: "signin", tokenHash, cardId, pay };
  return { ok: true, kind: "other-device" };
}

/** A second tap on an accepted link. */
async function reenter(guest: PassGuest, session: SessionUser, joinPath: string): Promise<GuestAcceptResult | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("event_registrations")
    .select("user_id, card_id")
    .eq("id", guest.registrationId as string)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const ownerId = data.user_id as string;
  const cardId = (data.card_id as string | null) ?? null;
  if (!isPassAccount(await accountKind(ownerId))) {
    if (session?.id === ownerId) return { ok: true, kind: "go", next: joinPath };
    return { ok: true, kind: "go", next: signInPath(joinPath) };
  }
  return enterAsPass(ownerId, session, cardId);
}

/**
 * A permanent account joins with its own card: the one tapped, or the first portfolio, changed later on the event page.
 * Without a portfolio the event page opens as it is. The consent is recorded once, with the new registration.
 */
export async function joinWithOwnCard(
  userId: string,
  event: EventInvite,
  lookup: string,
  guestToken: string | null,
  chosenCardId: string | null = null,
): Promise<{ ok: true; registrationId: string | null } | { ok: false; status: number; error: string }> {
  const existing = await loadOwnRegistration(event.id, userId);
  const cardId = existing?.cardId ?? chosenCardId ?? (await listOwnPortfolios(userId))[0]?.id;
  if (!cardId) return { ok: true, registrationId: null };
  if (!existing && !guestToken && (await loadEventSeats(event.id)).soldOut) {
    return { ok: false, status: 409, error: SOLD_OUT };
  }
  const joined = await registerForEvent(userId, lookup, cardId, undefined, guestToken);
  if (!joined.ok) return joined;
  if (!existing) await settleRegistration(userId, joined.registration.id, await linkedGuestId(joined.registration.id));
  return { ok: true, registrationId: joined.registration.id };
}

/** The pass account gets its clock, a card (the first pass card when it has one) and a registration. */
async function issuePass(
  userId: string,
  person: PassPerson,
  event: EventInvite,
  lookup: string,
  guest: PassGuest | null,
  timeZone: string | null,
): Promise<{ ok: true; registrationId: string; cardId: string; pay: boolean } | { ok: false; status: number; error: string }> {
  await markPassAccount(userId, timeZone);
  await startEventGuestClock(userId, eventGuestEnd(event));

  const existing = await loadOwnRegistration(event.id, userId);
  const reused = existing ? null : await existingPassCard(userId);
  const cardId = existing?.cardId ?? reused ?? (await createPassCard(userId, person, event));
  const joined = await registerForEvent(userId, lookup, cardId, undefined, guest?.token ?? null, person);
  if (!joined.ok) return joined;
  if (reused) {
    try {
      await refreshPassEventRow(userId, cardId);
    } catch (error) {
      console.error("[events] pass event row", error);
    }
  }
  await settleRegistration(userId, joined.registration.id, guest?.id ?? (await linkedGuestId(joined.registration.id)));
  return { ok: true, registrationId: joined.registration.id, cardId: joined.registration.cardId, pay: await paysFirst(event.id, userId) };
}

/**
 * Create my pass, or I'm going, on a personal link.
 * A permanent account joins with its own card. An email that already has a profile signs in.
 * Anyone else gets a pass account, a card with the event and the contact, and a registration.
 */
export async function acceptGuestPass(
  lookup: string,
  token: unknown,
  session: SessionUser,
  timeZone: unknown = null,
): Promise<GuestAcceptResult> {
  const event = await loadEventInvite(lookup);
  if (!event) return { ok: false, status: 404, error: "Event not found" };
  const guest = await findPassGuest(event.id, token);
  if (!guest) return { ok: false, status: 404, error: "Invitation not found" };
  const joinPath = `/e/${encodeURIComponent(event.slug ?? event.code)}/join`;

  if (guest.registrationId) {
    const again = await reenter(guest, session, joinPath);
    if (again) return again;
  }
  if (eventListStatus(event.date, Date.now(), event.endsAt) === "past") {
    return { ok: false, status: 410, error: "This event has ended" };
  }

  if (await isPermanentAccount(session)) {
    await joinWithOwnCard(session!.id, event, lookup, guest.token);
    return { ok: true, kind: "go", next: joinPath };
  }

  const emailOwner = guest.email ? await userIdForEmail(guest.email) : null;
  if (emailOwner && emailOwner !== session?.id && !isPassAccount(await accountKind(emailOwner))) {
    return { ok: true, kind: "go", next: signInPath(invitePath(event, guest.token)), notice: TAKEN_EMAIL };
  }

  let userId: string;
  if (guest.email) userId = emailOwner ?? (await createEmailGuest(guest.email));
  else if (session) userId = session.id;
  else return { ok: false, status: 401, error: "Open the link again." };

  const issued = await issuePass(userId, guest, event, lookup, guest, validTimeZone(timeZone));
  if (!issued.ok) return issued;
  if (guest.email) return enterAsPass(userId, session, issued.cardId, issued.pay);
  return { ok: true, kind: "here", cardId: issued.cardId, pay: issued.pay };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Email or phone, as typed. Anything else is not a contact. */
export function readPassContact(raw: unknown): { email: string | null; phone: string | null } | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value || value.length > 254) return null;
  if (value.includes("@")) return EMAIL.test(value) ? { email: value.toLowerCase(), phone: null } : null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15 || !/^\+?[\d\s().-]+$/.test(value)) return null;
  return { email: null, phone: value.replace(/\s+/g, " ") };
}

/**
 * Create my pass on the open link: a name and an email or a phone.
 * The pass lives on this browser's session. A typed email is confirmed by Supabase afterwards,
 * so it never signs anybody in by itself. An email that already holds an event pass elsewhere
 * gets its sign-in by mail; a permanent account or one with a password goes to Sign in.
 */
export async function createOpenPass(
  lookup: string,
  input: { name: unknown; contact: unknown; timeZone?: unknown },
  session: SessionUser,
  guard: { ip: string; trap: boolean; origin: string },
): Promise<GuestAcceptResult> {
  const event = await loadEventInvite(lookup);
  if (!event) return { ok: false, status: 404, error: "Event not found" };
  if (eventListStatus(event.date, Date.now(), event.endsAt) === "past") {
    return { ok: false, status: 410, error: "This event has ended" };
  }
  const base = `/e/${encodeURIComponent(event.slug ?? event.code)}`;
  const joinPath = `${base}/join`;
  if (guard.trap) return { ok: true, kind: "go", next: base };
  if (await isPermanentAccount(session)) return { ok: true, kind: "go", next: joinPath };

  const name = typeof input.name === "string" ? input.name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  if (!name) return { ok: false, status: 400, error: "Add your name." };
  const contact = readPassContact(input.contact);
  if (!contact) return { ok: false, status: 400, error: "Add your email or phone." };

  const holder = await holderOfContact(event.id, contact);
  const emailOwner = contact.email ? await userIdForEmail(contact.email) : null;
  const other = [holder, emailOwner].find((id): id is string => Boolean(id) && id !== session?.id) ?? null;
  if (other) {
    if (!isPassAccount(await accountKind(other)) || (await hasPassword(other))) {
      return { ok: true, kind: "go", next: signInPath(joinPath), notice: TAKEN_EMAIL };
    }
    if (!contact.email || !(await ownsEmail(other, contact.email))) return { ok: true, kind: "notice", text: PHONE_HAS_PASS };
    return mailPassLink(other, { name, ...contact, email: contact.email }, event, lookup, input.timeZone, guard);
  }
  if (!session) return { ok: false, status: 401, error: "Open the link again." };

  const fresh = !(await loadOwnRegistration(event.id, session.id));
  if (fresh) {
    if ((await loadEventSeats(event.id)).soldOut) return { ok: false, status: 409, error: SOLD_OUT };
    if (!(await passAllowed(event.id, guard.ip))) return { ok: false, status: 429, error: TRY_LATER };
  }
  const issued = await issuePass(session.id, { name, ...contact }, event, lookup, null, validTimeZone(input.timeZone));
  if (!issued.ok) return issued;
  if (fresh) await recordPass(event.id, guard.ip);
  const admin = createAdminSupabaseClient();
  const current = contact.email ? (await admin.auth.admin.getUserById(session.id)).data.user?.email?.toLowerCase() : null;
  const confirmEmail = contact.email && current !== contact.email ? contact.email : undefined;
  return { ok: true, kind: "here", cardId: issued.cardId, confirmEmail, pay: issued.pay };
}
