import { createHash } from "node:crypto";
import { renderEventMail, type MailZone, type RenderedMail } from "@/shared/mail/event-mail";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { eventTitleLine } from "@/shared/event/event-title";
import { priceLabel } from "@/shared/event/payment-label";
import { formatEventRange } from "@/shared/event/when";
import { loadEventInvite, type EventInvite } from "@/shared/services/event-invite";
import { loadEventPay } from "@/shared/services/event-payment";
import { BATCH_MAX, mailConfigured, sendHtmlBatch, type HtmlMail } from "@/shared/services/mail";

export type MailKind = "invite" | "reminder" | "deletion";

export type MailEvent = {
  id: string;
  name: string;
  key: string;
  when: string | null;
  place: string | null;
  price: string | null;
  organiser: string;
  replyTo: string | null;
};

export type Invitee = { id: string; name: string; email: string; token: string; sendCount: number };

const PLACE_SECRET = "Revealed closer to the date";
const PASS_LINE =
  "Your pass is one tap away. It is your card at the event — show it at the door, share it with people you meet.";
const INVITE_NOTE = "By tapping you agree to the event rules, Terms and Privacy. This link is your pass — don't forward it.";

function eventKey(event: Pick<EventInvite, "slug" | "code">): string {
  return encodeURIComponent(event.slug?.trim() || event.code);
}

async function organiserOf(eventId: string): Promise<{ name: string; email: string | null }> {
  const admin = createAdminSupabaseClient();
  const owner = await admin.from("events").select("owner_id").eq("id", eventId).maybeSingle();
  const ownerId = (owner.data as { owner_id?: string } | null)?.owner_id;
  if (!ownerId) return { name: "the host", email: null };
  const [cards, user] = await Promise.all([
    admin.from("cards").select("display_name, is_primary, created_at").eq("owner_id", ownerId).order("created_at"),
    admin.auth.admin.getUserById(ownerId),
  ]);
  const rows = (cards.error ? [] : (cards.data ?? [])) as { display_name: string | null; is_primary?: boolean | null }[];
  const card = rows.find((row) => row.is_primary && row.display_name?.trim()) ?? rows.find((row) => row.display_name?.trim());
  const name = card?.display_name?.replace(/\s+/g, " ").trim() || "the host";
  const email = user.data.user?.email_confirmed_at ? (user.data.user.email ?? null) : null;
  return { name, email };
}

export async function loadMailEvent(lookup: string): Promise<MailEvent | null> {
  const invite = await loadEventInvite(lookup);
  if (!invite) return null;
  const [pay, organiser] = await Promise.all([loadEventPay(invite.id), organiserOf(invite.id)]);
  return {
    id: invite.id,
    name: eventTitleLine(invite.name),
    key: eventKey(invite),
    when: formatEventRange(invite.date, invite.endsAt, invite.timeZone),
    place: invite.placeSecret ? PLACE_SECRET : invite.place?.trim() || null,
    price: pay.isPaid ? priceLabel(pay.price, pay.currency) : null,
    organiser: organiser.name,
    replyTo: organiser.email,
  };
}

export function personalLink(origin: string, event: MailEvent, token: string): string {
  return `${origin}/e/${event.key}?g=${encodeURIComponent(token)}`;
}

export function unsubscribePage(origin: string, event: MailEvent, token: string): string {
  return `${origin}/e/${event.key}/unsubscribe?g=${encodeURIComponent(token)}`;
}

/** Gmail and Apple Mail show «Unsubscribe» and post here in one click. */
export function unsubscribeHeaders(origin: string, event: MailEvent, token: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${origin}/api/events/${event.key}/unsubscribe?g=${encodeURIComponent(token)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

function poster(origin: string, event: MailEvent) {
  return { src: `${origin}/e/${event.key}/opengraph-image`, alt: event.name };
}

function placeZone(event: MailEvent, withPrice: boolean): MailZone | null {
  const value = [event.place, withPrice ? event.price : null].filter(Boolean).join(" · ");
  return value ? { label: "Place", value } : null;
}

export function inviteMail(origin: string, event: MailEvent, guest: { name: string; token: string }): RenderedMail {
  const zones: (MailZone | null)[] = [
    { label: "Invitation for", value: guest.name, lead: true },
    { label: "Event", value: event.name },
    event.when ? { label: "Date", value: event.when } : null,
    placeZone(event, true),
    { label: "Pass", value: PASS_LINE },
  ];
  return renderEventMail({
    poster: poster(origin, event),
    zones: zones.filter((zone): zone is MailZone => zone !== null),
    button: { label: "I'M GOING", href: personalLink(origin, event, guest.token) },
    footnote: INVITE_NOTE,
    footer: { organiser: event.organiser, unsubscribeHref: unsubscribePage(origin, event, guest.token) },
  });
}

export function inviteSubject(event: MailEvent): string {
  return `${event.name} — your pass`;
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
    const mails: HtmlMail[] = claimed.map((guest) => {
      const body = inviteMail(origin, event, guest);
      return {
        to: guest.email,
        subject: inviteSubject(event),
        html: body.html,
        text: body.text,
        replyTo: event.replyTo,
        headers: unsubscribeHeaders(origin, event, guest.token),
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
