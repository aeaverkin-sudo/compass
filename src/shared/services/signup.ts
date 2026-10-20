import { nanoid } from "nanoid";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { createEmptyContactItem, normalizeContactItem } from "@/shared/services/contact-item";
import { isEmail, userIdForEmail } from "@/shared/services/email-signup";
import { loadEventInvite } from "@/shared/services/event-invite";
import { joinWithOwnCard, PASSWORD_SET } from "@/shared/services/member-account";
import { slugFromName, uniqueHandle } from "@/shared/services/card-handle";
import { saveConnection } from "@/shared/services/save-connection";
import { mailConfigured, sendHtmlMail } from "@/shared/services/mail";
import { publicCardPath } from "@/shared/services/public-card-url";
import { walletLinkPath } from "@/shared/services/wallet-link";
import { WELCOME_SUBJECT, welcomeMail } from "@/shared/mail/welcome-mail";

export const MIN_PASSWORD = 8;

export type SignupZone = { id: string; title: string; rows: string[] };

export type SignupBody = {
  email?: string;
  password?: string;
  card?: {
    displayName?: string;
    rubricOrder?: string[];
    rubricLabels?: Record<string, string>;
    zones?: SignupZone[];
  };
  event?: { lookup?: string; guestToken?: string | null };
  sourceToken?: string;
  next?: string;
};

export type SignupResult =
  | { ok: true; status: 201; cardId: string; next: string }
  | { ok: false; status: number; error: string; kind?: "login" };

function emailTaken(error: { message?: string; code?: string } | null) {
  const text = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  return text.includes("already") || text.includes("email_exists") || text.includes("duplicate");
}

/** Only these returns are kept. Anything else lands on /main. */
export function signupNext(input: { pay: boolean; lookup: string; requested: string }): string {
  if (input.pay && input.lookup) return `/e/${encodeURIComponent(input.lookup)}/join`;
  const next = input.requested;
  if (/^\/scan\/card\?token=/.test(next)) return next;
  if (/^\/save\/[A-Za-z0-9_-]{16,64}$/.test(next)) return next;
  if (/^\/e\/[^/]+\/team\/[^/]+/.test(next)) return next;
  return "/main";
}

function filledZones(zones: SignupZone[]) {
  return zones
    .map((zone) => ({
      id: zone.id.trim(),
      title: zone.title.trim(),
      rows: zone.rows.map((row) => row.trim()).filter(Boolean),
    }))
    .filter((zone) => zone.id && zone.rows.length > 0);
}

/** Create the account and its first card. Auth is created first; a failed write deletes that user. */
export async function createSignup(
  body: SignupBody,
  session: { id: string; anonymous: boolean } | null,
): Promise<SignupResult> {
  const accountMode = session != null && !session.anonymous && !body.email && !body.password;
  const email = (body.email ?? "").trim().toLowerCase();
  const password = (body.password ?? "").trim();
  const displayName = (body.card?.displayName ?? "").replace(/\s+/g, " ").trim();
  if (!displayName) return { ok: false, status: 400, error: "Add a title." };

  const admin = createAdminSupabaseClient();
  let userId = "";
  let created = false;

  if (accountMode && session) {
    userId = session.id;
  } else {
    if (!email || email.length > 254 || !isEmail(email)) return { ok: false, status: 400, error: "Add your email." };
    if (password.length < MIN_PASSWORD) {
      return { ok: false, status: 400, error: `Use at least ${MIN_PASSWORD} characters for the password.` };
    }
    if (await userIdForEmail(email)) return { ok: false, status: 409, error: "This email already has an account.", kind: "login" };
    const made = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { [PASSWORD_SET]: new Date().toISOString() },
    });
    if (made.error || !made.data.user) {
      if (emailTaken(made.error)) return { ok: false, status: 409, error: "This email already has an account.", kind: "login" };
      return { ok: false, status: 500, error: "Could not create the account." };
    }
    userId = made.data.user.id;
    created = true;
  }

  const cardId = crypto.randomUUID();
  try {
    const now = new Date().toISOString();
    const marked = await admin.from("profiles").upsert({ id: userId, registered_at: now }, { onConflict: "id" });
    if (marked.error) throw new Error(marked.error.message);

    const zones = filledZones(Array.isArray(body.card?.zones) ? body.card.zones : []);
    const labels: Record<string, string> = {};
    for (const zone of zones) {
      if (zone.title) labels[zone.id] = zone.title;
    }
    const order = zones.map((zone) => zone.id);
    const base = slugFromName(displayName);
    let handle: string | null = null;
    if (base) {
      const taken = await admin.from("cards").select("handle").ilike("handle", `${base}%`);
      const used = new Set(
        ((taken.data ?? []) as { handle: string | null }[])
          .map((row) => row.handle?.trim().toLowerCase())
          .filter((value): value is string => Boolean(value)),
      );
      handle = uniqueHandle(base, used);
    }

    const card = await admin.from("cards").insert({
      id: cardId,
      owner_id: userId,
      display_name: displayName,
      title: "",
      status: "published",
      public_token: nanoid(21),
      handle,
      qr_version: 1,
      is_public: true,
      is_primary: true,
      listed: true,
      rubric_order: order,
      rubric_labels: Object.keys(labels).length > 0 ? labels : null,
      created_at: now,
      updated_at: now,
    });
    if (card.error) throw new Error(card.error.message);

    const itemZones: Record<string, string> = {};
    let sort = 0;
    for (const zone of zones) {
      for (const row of zone.rows) {
        const normalized = normalizeContactItem(createEmptyContactItem(sort), row);
        const saved = await admin.from("items").insert({
          id: normalized.id,
          owner_id: userId,
          type: normalized.type,
          label: normalized.label,
          value: normalized.value,
          url: normalized.url,
        });
        if (saved.error) throw new Error(saved.error.message);
        const link = await admin.from("card_items").insert({
          card_id: cardId,
          item_id: normalized.id,
          sort_order: sort,
          visible: true,
        });
        if (link.error) throw new Error(link.error.message);
        itemZones[normalized.id] = zone.id;
        sort += 1;
      }
    }
    if (Object.keys(itemZones).length > 0) {
      const zoned = await admin.from("cards").update({ item_zones: itemZones }).eq("id", cardId);
      if (zoned.error && !/item_zones/i.test(zoned.error.message)) throw new Error(zoned.error.message);
    }

    let pay = false;
    const lookup = (body.event?.lookup ?? "").trim();
    if (lookup) {
      const event = await loadEventInvite(lookup);
      if (!event) throw new Error("Event not found");
      const joined = await joinWithOwnCard(userId, event, lookup, body.event?.guestToken ?? null, cardId);
      if (!joined.ok) throw new Error(joined.error);
      pay = joined.pay;
    }

    const sourceToken = (body.sourceToken ?? "").trim();
    if (sourceToken) {
      const source = await admin.from("cards").select("id, owner_id").eq("public_token", sourceToken).maybeSingle();
      if (source.error) throw new Error(source.error.message);
      const sourceId = (source.data as { id: string; owner_id: string } | null)?.id;
      const sourceOwner = (source.data as { id: string; owner_id: string } | null)?.owner_id;
      if (sourceId && sourceOwner !== userId) {
        const saved = await saveConnection({ ownerId: userId, cardId: sourceId });
        if (!saved.ok && !saved.own) throw new Error(saved.message);
      }
    }

    return {
      ok: true,
      status: 201,
      cardId,
      next: signupNext({ pay, lookup, requested: typeof body.next === "string" ? body.next : "" }),
    };
  } catch (error) {
    if (created) await admin.auth.admin.deleteUser(userId);
    else await admin.from("cards").delete().eq("id", cardId);
    const message = error instanceof Error ? error.message : "Could not create the portfolio.";
    return { ok: false, status: 500, error: message };
  }
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
