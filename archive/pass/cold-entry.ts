import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { isEmail, userIdForEmail } from "@/shared/services/email-signup";
import { loadEventInvite } from "@/shared/services/event-invite";
import { findPassGuest, isGuestToken } from "@/shared/services/event-guest-pass";
import { loadOpenLink } from "@/shared/services/event-open-link";
import { passAllowed, recordPass, TRY_LATER } from "@/shared/services/event-pass-guard";
import { loadEventSeats, SOLD_OUT } from "@/shared/services/event-seats";
import { eventListStatus } from "@/shared/services/events";
import { BY_INVITATION, isPermanentAccount, PASSWORD_SET, type SessionUser } from "@/shared/services/member-account";
import { mailConfigured, sendEventSignIn, sendHtmlMail } from "@/shared/services/mail";
import { publicCardPath } from "@/shared/services/public-card-url";
import { clearTrialClock } from "@/shared/services/trial";
import { walletLinkPath } from "@/shared/services/wallet-link";
import { WELCOME_SUBJECT, welcomeMail } from "@/shared/mail/welcome-mail";
import { customAlphabet } from "nanoid";

const issuedPassword = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);

export const MIN_PASSWORD = 8;

export type ColdEntryResult =
  /** The session is now this permanent account. The browser signs in with the same password. */
  | { ok: true; kind: "created"; password?: string }
  /** The email already has an account: the sign-in link went there. */
  | { ok: true; kind: "mailed"; email: string }
  | { ok: true; kind: "go"; next: string }
  | { ok: false; status: number; error: string };

function emailTaken(error: { message?: string; code?: string } | null) {
  const text = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  return text.includes("already") || text.includes("email_exists") || text.includes("duplicate");
}

async function mailSignInLink(
  email: string,
  event: { id: string; name: string; key: string },
  guard: { ip: string; origin: string },
  guestToken: string | null,
): Promise<ColdEntryResult> {
  if (!(await passAllowed(event.id, guard.ip))) return { ok: false, status: 429, error: TRY_LATER };
  const admin = createAdminSupabaseClient();
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw new Error(link.error.message);
  const hash = link.data.properties?.hashed_token;
  if (!hash) throw new Error("no sign-in link");
  const params = new URLSearchParams({ t: hash });
  if (guestToken) params.set("g", guestToken);
  const href = `${guard.origin}/e/${event.key}/create?${params.toString()}`;
  await sendEventSignIn(email, event.name.replace(/\s+/g, " ").trim(), href, guard.origin);
  await recordPass(event.id, guard.ip);
  return { ok: true, kind: "mailed", email };
}

/**
 * Create the account at the end of the questionnaire. A new email turns this browser's session
 * into a permanent account and returns the password once. An email that already has an account
 * gets a sign-in link instead. Nothing is created before this call.
 */
export async function createColdEntryAccount(
  lookup: string,
  input: { email: unknown; password: unknown; guestToken?: unknown },
  session: SessionUser,
  guard: { ip: string; trap: boolean; origin: string },
): Promise<ColdEntryResult> {
  const event = await loadEventInvite(lookup);
  if (!event) return { ok: false, status: 404, error: "Event not found" };
  if (eventListStatus(event.date, Date.now(), event.endsAt) === "past") {
    return { ok: false, status: 410, error: "This event has ended" };
  }
  const key = encodeURIComponent(event.slug ?? event.code);
  if (guard.trap) return { ok: true, kind: "go", next: `/e/${key}` };
  if (await isPermanentAccount(session)) return { ok: true, kind: "go", next: `/e/${key}/join` };
  const guest = isGuestToken(input.guestToken) ? await findPassGuest(event.id, input.guestToken) : null;
  if (!guest && !(await loadOpenLink(event.id)).open) return { ok: false, status: 403, error: BY_INVITATION };

  const email = (guest?.email || (typeof input.email === "string" ? input.email : "")).trim().toLowerCase();
  if (!email || email.length > 254 || !isEmail(email)) return { ok: false, status: 400, error: "Add your email." };
  const mailEvent = { id: event.id, name: event.name, key };

  const owner = await userIdForEmail(email);
  if (owner && owner !== session?.id) return mailSignInLink(email, mailEvent, guard, guest?.token ?? null);

  let password = typeof input.password === "string" ? input.password.trim() : "";
  let issued: string | undefined;
  if (password.length < MIN_PASSWORD) {
    if (password.length > 0) {
      return { ok: false, status: 400, error: `Use at least ${MIN_PASSWORD} characters for the password.` };
    }
    const raw = issuedPassword();
    password = `${raw.slice(0, 4)}-${raw.slice(4)}`;
    issued = password;
  }
  if (!session) return { ok: false, status: 401, error: "Open the link again." };
  if (!guest && (await loadEventSeats(event.id)).soldOut) return { ok: false, status: 409, error: SOLD_OUT };
  if (!(await passAllowed(event.id, guard.ip))) return { ok: false, status: 429, error: TRY_LATER };

  const admin = createAdminSupabaseClient();
  const current = (await admin.auth.admin.getUserById(session.id)).data.user;
  const updated = await admin.auth.admin.updateUserById(session.id, {
    email,
    password,
    email_confirm: true,
    app_metadata: { ...current?.app_metadata, [PASSWORD_SET]: new Date().toISOString() },
  });
  if (updated.error) {
    if (emailTaken(updated.error)) return mailSignInLink(email, mailEvent, guard, guest?.token ?? null);
    throw new Error(updated.error.message);
  }
  await clearTrialClock(session.id);
  await recordPass(event.id, guard.ip);
  return { ok: true, kind: "created", ...(issued ? { password: issued } : {}) };
}

const WELCOME_SENT = "welcome_mail_at";

function siteOrigin(origin: string): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  return site && /^https?:\/\//i.test(site) ? site : origin;
}

/** Once per account, to its own confirmed email: the password, the profile link and the Wallet. */
export async function sendWelcomeMail(userId: string, cardId: string, password: string, origin: string): Promise<boolean> {
  if (!mailConfigured()) return false;
  const admin = createAdminSupabaseClient();
  const user = (await admin.auth.admin.getUserById(userId)).data.user;
  const email = user?.email?.trim().toLowerCase();
  if (!user || !email || user.app_metadata?.[WELCOME_SENT]) return false;
  const card = await admin.from("cards").select("owner_id, handle, public_token").eq("id", cardId).maybeSingle();
  if (card.error) throw new Error(card.error.message);
  const row = card.data as { owner_id: string; handle: string | null; public_token: string | null } | null;
  if (!row || row.owner_id !== userId) return false;

  const site = siteOrigin(origin);
  const mail = welcomeMail({
    logoSrc: `${site}/brand/aded-grid-mail.png`,
    password: password.trim(),
    profileUrl: `${site}${publicCardPath({ publicToken: row.public_token ?? "", handle: row.handle ?? undefined })}`,
    walletSectionUrl: `${site}/profile#portfolios`,
    walletPassUrl: `${site}${walletLinkPath(cardId)}`,
    accountUrl: `${site}/profile`,
    siteLabel: site.replace(/^https?:\/\//, ""),
  });
  await sendHtmlMail({ to: email, subject: WELCOME_SUBJECT, html: mail.html, text: mail.text });
  const marked = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...user.app_metadata, [WELCOME_SENT]: new Date().toISOString() },
  });
  if (marked.error) console.error("[mail] welcome mark", marked.error.message);
  return true;
}
