import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { isEmail, userIdForEmail } from "@/shared/services/email-signup";
import { mailConfigured, sendSaveLink } from "@/shared/services/mail";

/** Set on an account this link created; the first save turns it into a registered one. */
export const SAVE_SIGNUP = "save_signup";

const LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;
const sent = new Map<string, number[]>();

function allowed(key: string): boolean {
  const since = Date.now() - WINDOW_MS;
  const recent = (sent.get(key) ?? []).filter((at) => at > since);
  sent.set(key, recent);
  return recent.length < LIMIT;
}

function record(...keys: string[]) {
  for (const key of keys) sent.set(key, [...(sent.get(key) ?? []), Date.now()]);
}

export type SaveLinkResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Mails a one-time sign-in link that saves this card. An email with an account signs in to it, password or not;
 * a new email gets a light account. The answer is the same either way.
 */
export async function mailSaveLink(input: { token: string; email: string; origin: string; ip: string }): Promise<SaveLinkResult> {
  const email = input.email.trim().toLowerCase();
  if (!isEmail(email)) return { ok: false, status: 400, error: "Enter an email" };
  if (!mailConfigured()) return { ok: false, status: 503, error: "Email isn't set up yet" };
  const ipKey = `ip:${input.ip}`;
  const emailKey = `email:${email}`;
  if (!allowed(ipKey) || !allowed(emailKey)) return { ok: false, status: 429, error: "Try again in a few minutes" };

  const admin = createAdminSupabaseClient();
  const card = await admin.from("cards").select("display_name").eq("public_token", input.token).maybeSingle();
  if (card.error) throw new Error(card.error.message);
  if (!card.data) return { ok: false, status: 404, error: "This card is not available" };

  const existing = await userIdForEmail(email);
  const link = existing
    ? await admin.auth.admin.generateLink({ type: "magiclink", email })
    : await admin.auth.admin.generateLink({ type: "invite", email });
  if (link.error) throw new Error(link.error.message);
  const hash = link.data.properties?.hashed_token;
  if (!hash) throw new Error("no_token");
  if (!existing && link.data.user) {
    await admin.auth.admin.updateUserById(link.data.user.id, {
      app_metadata: { ...link.data.user.app_metadata, [SAVE_SIGNUP]: true },
    });
  }

  const kind = existing ? "magiclink" : "invite";
  const url = `${input.origin}/c/${encodeURIComponent(input.token)}/add?h=${encodeURIComponent(hash)}&k=${kind}`;
  const name = ((card.data.display_name as string | null) ?? "").replace(/\s+/g, " ").trim() || "this card";
  await sendSaveLink(email, name, url);
  record(ipKey, emailKey);
  return { ok: true };
}
