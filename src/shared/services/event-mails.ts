import { createHash } from "node:crypto";
import { renderEventMail, type MailFrame, type MailZone, type RenderedMail } from "@/shared/mail/event-mail";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { eventTitleLine } from "@/shared/event/event-title";
import { priceLabel } from "@/shared/event/payment-label";
import { formatEventRange } from "@/shared/event/when";
import { loadEventInvite, type EventInvite } from "@/shared/services/event-invite";
import { loadEventPay } from "@/shared/services/event-payment";
import { loadShowGoing } from "@/shared/services/event-going";
import { nanoid } from "nanoid";
import { inboxMissing, linkGuestAccounts } from "@/shared/services/event-invite-inbox";
import { posterUrl } from "@/shared/services/poster-snapshot";
import { BATCH_MAX, mailConfigured, sendHtmlBatch, type HtmlMail } from "@/shared/services/mail";

export type MailKind = "invite" | "reminder" | "deletion";

export type MailEvent = {
  id: string;
  name: string;
  key: string;
  when: string | null;
  place: string | null;
  price: string | null;
  /** The stored poster snapshot, or null before the first one. */
  posterSrc: string | null;
};

export type Invitee = { id: string; name: string; email: string; token: string; sendCount: number };

const PLACE_SECRET = "Revealed closer to the date";
const PASS_LINE = "Your pass is your portfolio at this event — show it at the door, share it with people you meet.";
const MEMBER_LINE = "You have an ADED account — this invitation is also in Network → Events.";
const INVITE_NOTE = "By tapping you agree to the event rules, Terms and Privacy. This link is your pass — don't forward it.";

function eventKey(event: Pick<EventInvite, "slug" | "code">): string {
  return encodeURIComponent(event.slug?.trim() || event.code);
}

/** A database without the poster columns, or an event without a snapshot, gives null. */
async function storedPoster(eventId: string): Promise<string | null> {
  const admin = createAdminSupabaseClient();
  const loaded = await admin.from("events").select("poster_path, poster_updated_at").eq("id", eventId).maybeSingle();
  if (loaded.error) return null;
  const row = loaded.data as { poster_path?: string | null; poster_updated_at?: string | null } | null;
  return posterUrl(row?.poster_path, row?.poster_updated_at);
}

export async function loadMailEvent(lookup: string): Promise<MailEvent | null> {
  const invite = await loadEventInvite(lookup);
  if (!invite) return null;
  const [pay, posterSrc] = await Promise.all([loadEventPay(invite.id), storedPoster(invite.id)]);
  return {
    id: invite.id,
    name: eventTitleLine(invite.name),
    key: eventKey(invite),
    when: formatEventRange(invite.date, invite.endsAt, invite.timeZone),
    place: invite.placeSecret ? PLACE_SECRET : invite.place?.trim() || null,
    price: pay.isPaid ? priceLabel(pay.price, pay.currency) : null,
    posterSrc,
  };
}

export function personalLink(origin: string, event: MailEvent, token: string): string {
  return `${origin}/e/${event.key}?g=${encodeURIComponent(token)}`;
}

/** I'm going in the mail goes straight in, without the poster again. */
export function goLink(origin: string, event: MailEvent, token: string): string {
  return `${origin}/e/${event.key}/go?g=${encodeURIComponent(token)}`;
}

export function unsubscribePage(origin: string, event: MailEvent, token: string): string {
  return `${origin}/e/${event.key}/unsubscribe?g=${encodeURIComponent(token)}`;
}

/** The snapshot of the live poster; until there is one, the OG image. The tap opens the poster page. */
function poster(origin: string, event: MailEvent, href: string) {
  return { src: event.posterSrc ?? `${origin}/e/${event.key}/opengraph-image`, alt: event.name, href };
}

/** The logo is a file of the site itself, by its public address. */
function adedLogo(origin: string): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  return `${site && /^https?:\/\//i.test(site) ? site : origin}/brand/aded-grid-mail.png`;
}

function placeZone(event: MailEvent, withPrice: boolean): MailZone | null {
  const value = [event.place, withPrice ? event.price : null].filter(Boolean).join(" · ");
  return value ? { label: "Place", value } : null;
}

export function inviteMail(
  origin: string,
  event: MailEvent,
  guest: { name: string; token: string; member?: boolean },
  frame?: MailFrame,
): RenderedMail {
  const zones: (MailZone | null)[] = [
    { label: "Invitation for", value: guest.name, lead: true },
    { label: "Event", value: event.name },
    event.when ? { label: "Date", value: event.when } : null,
    placeZone(event, true),
    { label: "Pass", value: PASS_LINE },
  ];
  const link = personalLink(origin, event, guest.token);
  return renderEventMail({
    poster: poster(origin, event, link),
    zones: zones.filter((zone): zone is MailZone => zone !== null),
    button: { label: "I'M GOING", href: goLink(origin, event, guest.token) },
    footnote: INVITE_NOTE,
    closing: guest.member ? MEMBER_LINE : null,
    footer: { logoSrc: adedLogo(origin), unsubscribeHref: unsubscribePage(origin, event, guest.token) },
  }, frame);
}

export function inviteSubject(event: MailEvent): string {
  return event.name;
}

/** Bounces and the mail log are in place: the event mails migration ran. */
export async function eventMailsReady(): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const [guests, log] = await Promise.all([
    admin.from("event_guests").select("bounced_at, last_mail_error").limit(1),
    admin.from("event_mail_log").select("id").limit(1),
  ]);
  return !guests.error && !log.error;
}

/** Guests with an email who never got the invite, did not bounce and did not unsubscribe. */
export async function pendingInvitees(eventId: string): Promise<Invitee[]> {
  const admin = createAdminSupabaseClient();
  const out: Invitee[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("event_guests")
      .select("id, name, email, token, send_count")
      .eq("event_id", eventId)
      .not("email", "is", null)
      .is("sent_at", null)
      .is("bounced_at", null)
      .is("unsubscribed_at", null)
      .order("created_at")
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { id: string; name: string; email: string; token: string; send_count: number | null }[];
    for (const row of rows) out.push({ id: row.id, name: row.name, email: row.email, token: row.token, sendCount: row.send_count ?? 0 });
    if (rows.length < 1000) return out;
  }
}

/** Claims the guests for this kind of mail. Someone already claimed is skipped. */
export async function claimMail(eventId: string, kind: MailKind, guestIds: string[]): Promise<Map<string, string>> {
  if (guestIds.length === 0) return new Map();
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("event_mail_log")
    .upsert(
      guestIds.map((guestId) => ({ event_id: eventId, guest_id: guestId, kind })),
      { onConflict: "guest_id,kind", ignoreDuplicates: true },
    )
    .select("id, guest_id");
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as { id: string; guest_id: string }[]).map((row) => [row.guest_id, row.id]));
}

export async function logMail(eventId: string, kind: MailKind, guestId: string | null, providerId: string | null): Promise<void> {
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("event_mail_log").insert({ event_id: eventId, guest_id: guestId, kind, provider_id: providerId });
  if (error && !/duplicate|unique/i.test(error.message)) console.error("[mail] log", error.message);
}

const GUEST_TOKEN = /^[A-Za-z0-9_-]{21}$/;

/** No more invites or reminders for this guest. The deletion mail still goes: it is about the data. */
export async function unsubscribeGuest(eventId: string, token: unknown): Promise<boolean> {
  if (typeof token !== "string" || !GUEST_TOKEN.test(token)) return false;
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("event_guests")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("event_id", eventId)
    .eq("token", token)
    .select("id, unsubscribed_at");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/** Resend reported a bounce or a complaint for this mail: no more mail to that guest. */
export async function markBounced(providerId: string): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("event_mail_log").select("guest_id").eq("provider_id", providerId);
  if (error) throw new Error(error.message);
  const guestIds = [...new Set(((data ?? []) as { guest_id: string | null }[]).flatMap((row) => (row.guest_id ? [row.guest_id] : [])))];
  if (guestIds.length === 0) return false;
  const updated = await admin.from("event_guests").update({ bounced_at: new Date().toISOString() }).in("id", guestIds).is("bounced_at", null);
  if (updated.error) throw new Error(updated.error.message);
  return true;
}

export type ReminderState = { ready: boolean; enabled: boolean; sentAt: string | null };

export async function loadReminder(eventId: string): Promise<ReminderState> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("events").select("reminder_enabled, reminder_sent_at").eq("id", eventId).maybeSingle();
  if (error) {
    if (/reminder_/i.test(error.message)) return { ready: false, enabled: false, sentAt: null };
    throw new Error(error.message);
  }
  const row = data as { reminder_enabled?: boolean | null; reminder_sent_at?: string | null } | null;
  return { ready: true, enabled: row?.reminder_enabled !== false, sentAt: row?.reminder_sent_at ?? null };
}

export async function saveReminder(eventId: string, on: boolean): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("events").update({ reminder_enabled: on }).eq("id", eventId);
  if (error) {
    if (/reminder_/i.test(error.message)) return false;
    throw new Error(error.message);
  }
  return true;
}

const DOOR_LINE = "Show your pass to enter — no printing, no app.";
const PORTFOLIO_LINE =
  "Add your contacts, links, professional details, social media and files — the portfolio you share at this event.";

export function reminderMail(
  origin: string,
  event: MailEvent,
  person: { link: string; token: string | null },
  going: number | null,
): RenderedMail {
  const door = going != null ? `${going} ${going === 1 ? "person is" : "people are"} going. ${DOOR_LINE}` : DOOR_LINE;
  const zones: (MailZone | null)[] = [
    { label: "Tomorrow", value: event.name, lead: true },
    event.when ? { label: "Date", value: event.when } : null,
    placeZone(event, false),
    { label: "Door", value: door },
    { label: "Portfolio", value: PORTFOLIO_LINE },
  ];
  return renderEventMail({
    poster: poster(origin, event, person.link),
    zones: zones.filter((zone): zone is MailZone => zone !== null),
    button: { label: "MY PASS & PORTFOLIO", href: person.link },
    footer: { logoSrc: adedLogo(origin), unsubscribeHref: person.token ? unsubscribePage(origin, event, person.token) : null },
  });
}

const KEEP_LINE =
  "Free, one tap. Your card and your Network stay — share it in everyday life with the people you met and want to remember you.";

/** 48 hours before the deletion, only to someone who met people. No poster, no unsubscribe. */
export function deletionMail(input: { eventName: string; met: number; expires: string; link: string }): RenderedMail {
  return renderEventMail({
    zones: [
      { label: "Your card", value: input.eventName, lead: true },
      { label: "You met", value: `${input.met} ${input.met === 1 ? "person — their card is" : "people — their cards are"} in your Network.` },
      { label: "Expires", value: `${input.expires} — the card and the people with it.` },
      { label: "Keep it", value: KEEP_LINE },
    ],
    button: { label: "KEEP MY PROFILE", href: input.link },
    footer: { plain: "ADED · adedme.com" },
  });
}

const HOUR_MS = 60 * 60 * 1000;

/** `member`: going without a guest row; the button opens the event page, the token is only for unsubscribe. */
type Recipient = { email: string; guestId: string | null; token: string | null; member?: boolean };

type MemberGuest = { id: string; token: string; unsubscribed_at: string | null; bounced_at: string | null };

/**
 * A member going without a guest row gets one, on no list, so the reminder carries the same
 * unsubscribe link as a guest's. The same email already on the event is that row.
 */
async function memberGuest(eventId: string, reg: { id: string; user_id: string; card_id: string | null }, email: string): Promise<MemberGuest | null> {
  const admin = createAdminSupabaseClient();
  const columns = "id, token, unsubscribed_at, bounced_at";
  const same = await admin.from("event_guests").select(columns).eq("event_id", eventId).eq("email", email).maybeSingle();
  if (same.error) return null;
  if (same.data) return same.data as MemberGuest;
  const card = reg.card_id ? await admin.from("cards").select("display_name").eq("id", reg.card_id).maybeSingle() : null;
  const name = ((card?.data as { display_name?: string | null } | null)?.display_name ?? "").replace(/\s+/g, " ").trim();
  const row = { event_id: eventId, name, email, token: nanoid(21), registration_id: reg.id };
  const withUser = await admin.from("event_guests").insert({ ...row, user_id: reg.user_id }).select(columns).maybeSingle();
  const created =
    withUser.error && inboxMissing(withUser.error.message)
      ? await admin.from("event_guests").insert(row).select(columns).maybeSingle()
      : withUser;
  if (created.error) {
    console.error("[mail] member guest", created.error.message);
    return null;
  }
  return created.data as MemberGuest | null;
}

async function reminderRecipients(eventId: string): Promise<Recipient[]> {
  const admin = createAdminSupabaseClient();
  const regs = await admin.from("event_registrations").select("id, user_id, card_id").eq("event_id", eventId);
  if (regs.error) throw new Error(regs.error.message);
  const rows = (regs.data ?? []) as { id: string; user_id: string; card_id: string | null }[];
  if (rows.length === 0) return [];
  const guests = await admin
    .from("event_guests")
    .select("id, email, token, registration_id, unsubscribed_at, bounced_at")
    .eq("event_id", eventId)
    .not("registration_id", "is", null);
  if (guests.error) throw new Error(guests.error.message);
  type Row = { id: string; email: string | null; token: string; registration_id: string; unsubscribed_at: string | null; bounced_at: string | null };
  const byReg = new Map(((guests.data ?? []) as Row[]).map((row) => [row.registration_id, row]));
  const out: Recipient[] = [];
  const seen = new Set<string>();
  for (const reg of rows) {
    const guest = byReg.get(reg.id);
    if (guest && (guest.unsubscribed_at || guest.bounced_at)) continue;
    let email = guest?.email?.trim().toLowerCase() ?? null;
    if (!email) {
      const user = await admin.auth.admin.getUserById(reg.user_id);
      email = user.data.user?.email?.trim().toLowerCase() ?? null;
    }
    if (!email || seen.has(email)) continue;
    seen.add(email);
    if (guest) {
      out.push({ email, guestId: guest.id, token: guest.token });
      continue;
    }
    const member = await memberGuest(eventId, reg, email);
    if (member && (member.unsubscribed_at || member.bounced_at)) continue;
    out.push({ email, guestId: member?.id ?? null, token: member?.token ?? null, member: true });
  }
  return out;
}

/**
 * One reminder per event, 23 to 25 hours before the start, to everyone going with an email.
 * The event is stamped first, so the hourly cron never sends it twice.
 */
export async function sendReminders(origin: string): Promise<number> {
  if (!mailConfigured()) return 0;
  const admin = createAdminSupabaseClient();
  const now = Date.now();
  const due = await admin
    .from("events")
    .select("id, code, slug")
    .eq("reminder_enabled", true)
    .is("reminder_sent_at", null)
    .gte("date", new Date(now + 23 * HOUR_MS).toISOString())
    .lte("date", new Date(now + 25 * HOUR_MS).toISOString())
    .limit(20);
  if (due.error) {
    if (/reminder_|slug/i.test(due.error.message)) return 0;
    throw new Error(due.error.message);
  }
  let sent = 0;
  for (const row of (due.data ?? []) as { id: string; code: string; slug: string | null }[]) {
    try {
      const stamped = await admin
        .from("events")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", row.id)
        .is("reminder_sent_at", null)
        .select("id");
      if (stamped.error) throw new Error(stamped.error.message);
      if ((stamped.data ?? []).length === 0) continue;
      sent += await remindEvent(row.id, row.slug?.trim() || row.code, origin);
    } catch (error) {
      console.error("[mail] reminder", row.id, error);
    }
  }
  return sent;
}

async function remindEvent(eventId: string, lookup: string, origin: string): Promise<number> {
  const event = await loadMailEvent(lookup);
  if (!event) return 0;
  const recipients = await reminderRecipients(eventId);
  const [shown, regs] = await Promise.all([
    loadShowGoing(eventId),
    createAdminSupabaseClient().from("event_registrations").select("id", { count: "exact", head: true }).eq("event_id", eventId),
  ]);
  const going = shown ? (regs.count ?? recipients.length) : null;
  let sent = 0;
  for (let index = 0; index < recipients.length; index += BATCH_MAX) {
    const chunk = recipients.slice(index, index + BATCH_MAX);
    const claims = await claimMail(eventId, "reminder", chunk.flatMap((person) => (person.guestId ? [person.guestId] : [])));
    const claimed = chunk.filter((person) => !person.guestId || claims.has(person.guestId));
    if (claimed.length === 0) continue;
    const mails: HtmlMail[] = claimed.map((person) => {
      const link = person.token && !person.member ? personalLink(origin, event, person.token) : `${origin}/e/${event.key}/join`;
      const body = reminderMail(origin, event, { link, token: person.token }, going);
      return {
        to: person.email,
        subject: `Tomorrow — ${event.name}`,
        html: body.html,
        text: body.text,
      };
    });
    const outcomes = await sendHtmlBatch(mails, batchKey("reminder", [eventId, String(index)]));
    const admin = createAdminSupabaseClient();
    await Promise.all(
      claimed.map(async (person, at) => {
        const outcome = outcomes[at];
        const logId = person.guestId ? claims.get(person.guestId) : undefined;
        if (outcome.ok) {
          sent += 1;
          if (logId) await admin.from("event_mail_log").update({ provider_id: outcome.id }).eq("id", logId);
          else await logMail(eventId, "reminder", null, outcome.id);
        } else {
          if (logId) await admin.from("event_mail_log").delete().eq("id", logId);
          if (person.guestId) await admin.from("event_guests").update({ last_mail_error: outcome.error.slice(0, 500) }).eq("id", person.guestId);
        }
      }),
    );
  }
  return sent;
}

function batchKey(kind: MailKind, logIds: string[]): string {
  return `${kind}-${createHash("sha256").update(logIds.join(",")).digest("hex").slice(0, 40)}`;
}

/**
 * The invite to every pending guest, in batches of 100. Each guest is claimed in the
 * mail log first, so a second tap sends nothing twice. A refused mail frees the claim
 * and keeps the guest Not sent with the error.
 */
export async function sendInvites(eventId: string, event: MailEvent, origin: string): Promise<{ sent: number; failed: number }> {
  if (!mailConfigured()) throw new Error("mail_not_configured");
  const admin = createAdminSupabaseClient();
  const invitees = await pendingInvitees(eventId);
  let sent = 0;
  let failed = 0;
  for (let index = 0; index < invitees.length; index += BATCH_MAX) {
    const chunk = invitees.slice(index, index + BATCH_MAX);
    const claims = await claimMail(eventId, "invite", chunk.map((guest) => guest.id));
    const claimed = chunk.filter((guest) => claims.has(guest.id));
    if (claimed.length === 0) continue;
    const members = await linkGuestAccounts(claimed);
    const mails: HtmlMail[] = claimed.map((guest) => {
      const body = inviteMail(origin, event, { ...guest, member: members.has(guest.id) });
      return {
        to: guest.email,
        subject: inviteSubject(event),
        html: body.html,
        text: body.text,
      };
    });
    const outcomes = await sendHtmlBatch(mails, batchKey("invite", claimed.map((guest) => claims.get(guest.id) as string)));
    const now = new Date().toISOString();
    await Promise.all(
      claimed.map(async (guest, at) => {
        const outcome = outcomes[at];
        const logId = claims.get(guest.id) as string;
        if (outcome.ok) {
          sent += 1;
          await Promise.all([
            admin.from("event_mail_log").update({ provider_id: outcome.id, sent_at: now }).eq("id", logId),
            admin
              .from("event_guests")
              .update({ sent_at: now, send_count: guest.sendCount + 1, last_mail_error: null })
              .eq("id", guest.id),
          ]);
        } else {
          failed += 1;
          await Promise.all([
            admin.from("event_mail_log").delete().eq("id", logId),
            admin.from("event_guests").update({ last_mail_error: outcome.error.slice(0, 500) }).eq("id", guest.id),
          ]);
        }
      }),
    );
  }
  return { sent, failed };
}
