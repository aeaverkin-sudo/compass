import { randomUUID } from "node:crypto";
import { nanoid } from "nanoid";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { CONSENT_VERSION } from "@/shared/services/consent";
import { userIdForEmail } from "@/shared/services/email-signup";
import { findPassGuest, passCardName, type PassGuest } from "@/shared/services/event-guest-pass";
import { loadEventInvite, type EventInvite } from "@/shared/services/event-invite";
import { loadOwnRegistration, registerForEvent } from "@/shared/services/event-registration";
import { eventListStatus } from "@/shared/services/events";
import { eventGuestEnd, startEventGuestClock } from "@/shared/services/trial";

export type SessionUser = { id: string; anonymous: boolean } | null;

export type GuestAcceptResult =
  /** Permanent account: the normal Join, after sign-in when needed. */
  | { ok: true; kind: "go"; next: string; carryToken: boolean }
  /** This browser already holds the guest's account. */
  | { ok: true; kind: "here"; cardId: string | null }
  /** The browser signs in as the guest with this one-time hash. */
  | { ok: true; kind: "signin"; tokenHash: string; cardId: string | null }
  /** A phone-only guest on a device that never held the pass. */
  | { ok: true; kind: "other-device" }
  | { ok: false; status: number; error: string };

type AccountKind = { registered: boolean; eventTrial: boolean };

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

async function magicHash(userId: string): Promise<string | null> {
  const admin = createAdminSupabaseClient();
  const loaded = await admin.auth.admin.getUserById(userId);
  const email = loaded.data.user?.email?.trim().toLowerCase();
  if (!email) return null;
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw new Error(link.error.message);
  return link.data.properties?.hashed_token ?? null;
}

async function createEmailGuest(email: string): Promise<string> {
  const admin = createAdminSupabaseClient();
  const created = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { event_trial: true } });
  if (created.data.user) return created.data.user.id;
  const raced = await userIdForEmail(email);
  if (raced) return raced;
  throw new Error(created.error?.message ?? "Could not create the guest.");
}

async function markPassAccount(userId: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  const loaded = await admin.auth.admin.getUserById(userId);
  const user = loaded.data.user;
  if (!user || user.app_metadata?.event_trial === true) return;
  const updated = await admin.auth.admin.updateUserById(userId, { app_metadata: { ...user.app_metadata, event_trial: true } });
  if (updated.error) throw new Error(updated.error.message);
}

/** First section Event with the event name, then Contact. No photo. */
async function createPassCard(userId: string, guest: PassGuest, event: EventInvite): Promise<string> {
  const admin = createAdminSupabaseClient();
  const cardId = randomUUID();
  const eventItemId = randomUUID();
  const contactItemId = randomUUID();
  const now = new Date().toISOString();
  const contact = guest.email
    ? { type: "email", value: guest.email, url: `mailto:${guest.email}` }
    : { type: "phone", value: guest.phone ?? "", url: `tel:${(guest.phone ?? "").replace(/\s/g, "")}` };

  const items = await admin.from("items").insert([
    { id: eventItemId, owner_id: userId, type: "text", label: "", value: event.name.replace(/\s+/g, " ").trim(), url: "" },
    { id: contactItemId, owner_id: userId, ...contact, label: "" },
  ]);
  if (items.error) throw new Error(items.error.message);

  const card = await admin.from("cards").insert({
    id: cardId,
    owner_id: userId,
    display_name: passCardName(guest.name),
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

async function recordEventConsent(userId: string, guestId: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  const row = { user_id: userId, document_version: CONSENT_VERSION, path: "event" };
  const full = await admin.from("consents").insert({ ...row, guest_id: guestId });
  if (!full.error) return;
  if (!/guest_id/i.test(full.error.message)) throw new Error(full.error.message);
  const kept = await admin.from("consents").insert(row);
  if (kept.error) throw new Error(kept.error.message);
}

async function enterAsPass(userId: string, session: SessionUser, cardId: string | null): Promise<GuestAcceptResult> {
  if (session?.id === userId) return { ok: true, kind: "here", cardId };
  const tokenHash = await magicHash(userId);
  if (tokenHash) return { ok: true, kind: "signin", tokenHash, cardId };
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
    if (session?.id === ownerId) return { ok: true, kind: "go", next: joinPath, carryToken: false };
    return { ok: true, kind: "go", next: `/register?signin=1&next=${encodeURIComponent(joinPath)}`, carryToken: false };
  }
  return enterAsPass(ownerId, session, cardId);
}

/**
 * I'm going on a personal link.
 * Permanent accounts take the normal Join. Anyone else gets a pass account,
 * a card with the event and the contact, and a registration on this event.
 */
export async function acceptGuestPass(lookup: string, token: unknown, session: SessionUser): Promise<GuestAcceptResult> {
  const event = await loadEventInvite(lookup);
  if (!event) return { ok: false, status: 404, error: "Event not found" };
  const guest = await findPassGuest(event.id, token);
  if (!guest) return { ok: false, status: 404, error: "Invitation not found" };
  const joinPath = `/e/${event.slug ?? event.code}/join`;

  if (guest.registrationId) {
    const again = await reenter(guest, session, joinPath);
    if (again) return again;
  }
  if (eventListStatus(event.date, Date.now(), event.endsAt) === "past") {
    return { ok: false, status: 410, error: "This event has ended" };
  }

  const sessionKind = session ? await accountKind(session.id) : null;
  if (session && sessionKind && !session.anonymous && !isPassAccount(sessionKind)) {
    return { ok: true, kind: "go", next: joinPath, carryToken: true };
  }

  const emailOwner = guest.email ? await userIdForEmail(guest.email) : null;
  if (emailOwner && emailOwner !== session?.id && !isPassAccount(await accountKind(emailOwner))) {
    return { ok: true, kind: "go", next: `/register?signin=1&next=${encodeURIComponent(joinPath)}`, carryToken: true };
  }

  let userId: string;
  if (guest.email) userId = emailOwner ?? (await createEmailGuest(guest.email));
  else if (session) userId = session.id;
  else return { ok: false, status: 401, error: "Open the link again." };

  await markPassAccount(userId);
  await startEventGuestClock(userId, eventGuestEnd(event));

  const existing = await loadOwnRegistration(event.id, userId);
  const cardId = existing?.cardId ?? (await createPassCard(userId, guest, event));
  const joined = await registerForEvent(userId, lookup, cardId, undefined, guest.token);
  if (!joined.ok) return joined;

  if (await onPaidList(guest.id)) await confirmListPayment(joined.registration.id);
  try {
    await recordEventConsent(userId, guest.id);
  } catch (error) {
    console.error("[events] guest consent", error);
  }

  if (guest.email) return enterAsPass(userId, session, joined.registration.cardId);
  return { ok: true, kind: "here", cardId: joined.registration.cardId };
}
