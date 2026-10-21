import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { CONSENT_VERSION, type EventConsentPath } from "@/shared/services/consent";
import { userIdForEmail } from "@/shared/services/email-signup";
import { findPassGuest, type PassGuest } from "@/shared/services/event-guest-pass";
import { loadEventInvite, type EventInvite } from "@/shared/services/event-invite";
import { listOwnPortfolios, loadOwnRegistration, registerForEvent, type PortfolioChoice } from "@/shared/services/event-registration";
import { eventListStatus } from "@/shared/services/events";
import { loadEventPay } from "@/shared/services/event-payment";
import { payView } from "@/shared/event/payment-label";
import { sendPassLink } from "@/shared/services/mail";
import { passAllowed, recordPass, TRY_LATER } from "@/shared/services/event-pass-guard";
import { loadEventSeats, SOLD_OUT } from "@/shared/services/event-seats";
import { ensureOpenLinkGuest, loadOpenLink } from "@/shared/services/event-open-link";

export type SessionUser = { id: string; anonymous: boolean } | null;

export type GuestAcceptResult =
  /** Leave for this path. A notice is shown first. */
  | { ok: true; kind: "go"; next: string; notice?: string }
  /** This browser already holds the guest's account. */
  | { ok: true; kind: "here"; cardId: string | null; pay?: boolean }
  /** The browser signs in as the guest with this one-time hash. Pay: the payment screen comes before the pass. */
  | { ok: true; kind: "signin"; tokenHash: string; cardId: string | null; pay?: boolean }
  /** An account is going: the page stays, with the badge card and the event page for Change. */
  | { ok: true; kind: "going"; badge: PortfolioChoice | null; change: string }
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

/** The account's own confirmed address, not one only typed on a card. */
async function ownsEmail(userId: string, email: string): Promise<boolean> {
  return (await authUser(userId))?.email?.trim().toLowerCase() === email;
}

export const BY_INVITATION = "This event is by invitation.";

/** The open link is on, or this account's email is on a list. */
export async function mayJoinWithoutLink(eventId: string, userId: string): Promise<boolean> {
  return (await loadOpenLink(eventId)).open || (await invitedByEmail(eventId, userId));
}

/** A list guest with this account's email gets in on a closed event without the personal link. */
async function invitedByEmail(eventId: string, userId: string): Promise<boolean> {
  const email = (await authUser(userId))?.email?.trim().toLowerCase();
  if (!email) return false;
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("event_guests").select("id").eq("event_id", eventId).eq("email", email).limit(1);
  return !error && (data ?? []).length > 0;
}

/** The name on the card and the account's email, for the Open link list. */
async function accountPerson(userId: string, cardId: string): Promise<PassPerson> {
  const admin = createAdminSupabaseClient();
  const [user, card] = await Promise.all([
    authUser(userId),
    admin.from("cards").select("display_name").eq("id", cardId).maybeSingle(),
  ]);
  const name = ((card.data as { display_name?: string | null } | null)?.display_name ?? "").replace(/\s+/g, " ").trim();
  return { name, email: user?.email?.trim().toLowerCase() ?? null, phone: user?.phone?.trim() || null };
}

/**
 * The link from the guest's mail reached this browser: an open link pass whose email was only typed
 * takes that address, so the mail signs in anywhere. The token is only in that mail.
 */
async function claimGuestEmail(ownerId: string, email: string | null): Promise<void> {
  if (!email) return;
  const user = await authUser(ownerId);
  if (!user || user.email) return;
  const address = email.trim().toLowerCase();
  if (await userIdForEmail(address)) return;
  const admin = createAdminSupabaseClient();
  const updated = await admin.auth.admin.updateUserById(ownerId, { email: address, email_confirm: true });
  if (updated.error) console.error("[events] guest email", updated.error.message);
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

/** The event rules, Terms and Privacy behind the asterisk. Before the SQL allows `mail`, it is stored as `event`. */
export async function recordEventConsent(userId: string, guestId: string | null, path: EventConsentPath = "event"): Promise<void> {
  const admin = createAdminSupabaseClient();
  const row = { user_id: userId, document_version: CONSENT_VERSION, path };
  if (guestId) {
    const full = await admin.from("consents").insert({ ...row, guest_id: guestId });
    if (!full.error) return;
    if (path === "mail" && /consents_path_check/i.test(full.error.message)) return recordEventConsent(userId, guestId);
    if (!/guest_id/i.test(full.error.message)) throw new Error(full.error.message);
  }
  const kept = await admin.from("consents").insert(row);
  if (kept.error && path === "mail" && /consents_path_check/i.test(kept.error.message)) return recordEventConsent(userId, guestId);
  if (kept.error) throw new Error(kept.error.message);
}

/** Going after all: the Not going answer is cleared once the registration is in. */
async function clearDecline(guestId: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("event_guests").update({ declined_at: null }).eq("id", guestId).not("declined_at", "is", null);
  if (error && !/declined_at/i.test(error.message)) console.error("[events] clear decline", error.message);
}

/** The list guest now linked to this registration, by token or by contact. */
async function linkedGuestId(registrationId: string): Promise<string | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("event_guests").select("id").eq("registration_id", registrationId).limit(1);
  if (error) return null;
  return ((data ?? []) as { id: string }[])[0]?.id ?? null;
}

/** Payment from a paid list, then the consent. Neither blocks the pass. */
async function settleRegistration(
  userId: string,
  registrationId: string,
  guestId: string | null,
  consentPath: EventConsentPath = "event",
): Promise<void> {
  if (guestId && (await onPaidList(guestId))) await confirmListPayment(registrationId);
  try {
    await recordEventConsent(userId, guestId, consentPath);
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

/** The card this account wears at the event. */
async function badgeFace(userId: string, eventId: string): Promise<PortfolioChoice | null> {
  const registration = await loadOwnRegistration(eventId, userId);
  if (!registration?.cardId) return null;
  return (await listOwnPortfolios(userId)).find((card) => card.id === registration.cardId) ?? null;
}

/** I'm going in the mail, a second time on a browser that does not hold the pass: the sign-in goes to the guest's address. */
async function mailSignIn(
  ownerId: string,
  guest: PassGuest,
  event: EventInvite,
  guard: { origin: string; ip: string },
  pay: boolean,
): Promise<GuestAcceptResult> {
  const email = guest.email;
  if (!email || !(await ownsEmail(ownerId, email))) return { ok: true, kind: "other-device" };
  const tokenHash = await magicHash(ownerId);
  if (tokenHash === "password") return { ok: true, kind: "go", next: signInPath("/main") };
  if (!tokenHash) return { ok: true, kind: "other-device" };
  if (!(await passAllowed(event.id, guard.ip))) return { ok: false, status: 429, error: TRY_LATER };
  const slug = encodeURIComponent(event.slug ?? event.code);
  const link = `${guard.origin}/e/${slug}/enter?t=${encodeURIComponent(tokenHash)}${pay ? "&pay=1" : ""}`;
  await sendPassLink(email, event.name.replace(/\s+/g, " ").trim(), link);
  await recordPass(event.id, guard.ip);
  return { ok: true, kind: "notice", text: `We sent a link to ${email} — open it to get your pass.` };
}

type AcceptFrom = { source: "page"; origin: string } | { source: "mail"; origin: string; ip: string };

/** A second tap on an accepted link. */
async function reenter(
  guest: PassGuest,
  session: SessionUser,
  joinPath: string,
  event: EventInvite,
  from: AcceptFrom,
): Promise<GuestAcceptResult | null> {
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
  if (session?.id !== ownerId) await claimGuestEmail(ownerId, guest.email);
  if (from.source === "mail" && session?.id !== ownerId) {
    return mailSignIn(ownerId, guest, event, from, await paysFirst(event.id, ownerId));
  }
  return enterAsPass(ownerId, session, cardId);
}

/** The primary card, else the first card with a name, else the first card. */
async function badgeCardId(userId: string): Promise<string | undefined> {
  const admin = createAdminSupabaseClient();
  const primary = await admin.from("cards").select("id").eq("owner_id", userId).eq("is_primary", true).limit(1);
  const primaryId = primary.error ? null : ((primary.data ?? []) as { id: string }[])[0]?.id;
  if (primaryId) return primaryId;
  const cards = await listOwnPortfolios(userId);
  return (cards.find((card) => card.name) ?? cards[0])?.id;
}

/**
 * A permanent account joins with its own card: the one tapped, or the primary card, changed later on the event page.
 * Without a portfolio the event page opens as it is. The consent is recorded once, with the new registration.
 */
export async function joinWithOwnCard(
  userId: string,
  event: EventInvite,
  lookup: string,
  guestToken: string | null,
  chosenCardId: string | null = null,
  consentPath: EventConsentPath = "event",
): Promise<{ ok: true; registrationId: string | null; pay: boolean } | { ok: false; status: number; error: string }> {
  const existing = await loadOwnRegistration(event.id, userId);
  const cardId = existing?.cardId ?? chosenCardId ?? (await badgeCardId(userId));
  if (!cardId) return { ok: true, registrationId: null, pay: false };
  const viaOpenLink = !existing && !guestToken;
  if (viaOpenLink && !(await mayJoinWithoutLink(event.id, userId))) {
    return { ok: false, status: 403, error: BY_INVITATION };
  }
  if (viaOpenLink && (await loadEventSeats(event.id)).soldOut) {
    return { ok: false, status: 409, error: SOLD_OUT };
  }
  const joined = await registerForEvent(userId, lookup, cardId, undefined, guestToken);
  if (!joined.ok) return joined;
  if (!existing) await settleRegistration(userId, joined.registration.id, await linkedGuestId(joined.registration.id), consentPath);
  if (viaOpenLink) await ensureOpenLinkGuest(event.id, joined.registration.id, await accountPerson(userId, cardId));
  return { ok: true, registrationId: joined.registration.id, pay: await paysFirst(event.id, userId) };
}

/**
 * I'm going on a personal link.
 * A permanent account joins with its own card. An email that already has a profile signs in.
 * Anyone else goes to Create a portfolio — no temporary pass.
 */
export async function acceptGuestPass(
  lookup: string,
  token: unknown,
  session: SessionUser,
  timeZone: unknown,
  from: AcceptFrom,
): Promise<GuestAcceptResult> {
  void timeZone;
  const event = await loadEventInvite(lookup);
  if (!event) return { ok: false, status: 404, error: "Event not found" };
  const guest = await findPassGuest(event.id, token);
  if (!guest) return { ok: false, status: 404, error: "Invitation not found" };
  const joinPath = `/e/${encodeURIComponent(event.slug ?? event.code)}/join`;
  const createPath = `/create?event=${encodeURIComponent(event.slug ?? event.code)}&g=${encodeURIComponent(guest.token)}`;
  const consentPath: EventConsentPath = from.source === "mail" ? "mail" : "event";

  if (guest.registrationId) {
    const again = await reenter(guest, session, joinPath, event, from);
    if (again) return again;
  }
  if (eventListStatus(event.date, Date.now(), event.endsAt) === "past") {
    return { ok: false, status: 410, error: "This event has ended" };
  }

  if (await isPermanentAccount(session)) {
    const joined = await joinWithOwnCard(session!.id, event, lookup, guest.token, null, consentPath);
    if (!joined.ok) return joined;
    if (!joined.registrationId) return { ok: true, kind: "go", next: joinPath };
    await clearDecline(guest.id);
    if (from.source === "mail") return { ok: true, kind: "go", next: joinPath };
    return { ok: true, kind: "going", badge: await badgeFace(session!.id, event.id), change: joinPath };
  }

  const emailOwner = guest.email ? await userIdForEmail(guest.email) : null;
  if (emailOwner && emailOwner !== session?.id && !isPassAccount(await accountKind(emailOwner))) {
    return { ok: true, kind: "go", next: signInPath(invitePath(event, guest.token)), notice: TAKEN_EMAIL };
  }

  return { ok: true, kind: "go", next: createPath };
}
