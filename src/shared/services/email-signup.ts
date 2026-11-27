import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { CODE_TTL_MS, MAX_ATTEMPTS, codesMatch, digitCode, hashCode, starterCode } from "@/shared/services/email-code";
import { mailConfigured, sendChangeCode, sendHtmlMail, sendPasswordReset, sendStarterCode } from "@/shared/services/mail";
import {
  MAIL_HOUR_MS,
  MAIL_PER_EMAIL,
  MAIL_PER_IP,
  TRY_LATER,
  planSignupMail,
  judgeSignupCode,
} from "@/shared/services/signup-code";
import { signupCodeMail, signupTakenMail } from "@/shared/mail/welcome-mail";
import { mailIpHash, mailLimitKey } from "@/shared/services/mail-limit";

export const MAIL_NOT_CONNECTED = "Email isn't set up yet";

export type EmailBranch =
  | { mode: "code" }
  | { mode: "login"; hasCard: boolean }
  | { mode: "done" };

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function emailTaken(error: { message?: string; code?: string } | null) {
  const text = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  return text.includes("already") || text.includes("email_exists") || text.includes("duplicate");
}

export async function userIdForEmail(email: string): Promise<string | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("auth_user_id_by_email", { address: email });
  if (error) throw new Error(error.message);
  return typeof data === "string" && data ? data : null;
}

export async function sessionHasCard(userId: string): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const { count, error } = await admin
    .from("cards")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

/** New email gets a starter code. An email that already exists is a login, not a second registration. */
export async function beginEmail(userId: string, rawEmail: string): Promise<EmailBranch> {
  const email = normalizeEmail(rawEmail);
  const existing = await userIdForEmail(email);
  if (existing === userId) return { mode: "done" };
  if (existing) return { mode: "login", hasCard: await sessionHasCard(userId) };

  if (!mailConfigured()) {
    throw new Error("mail_not_configured");
  }

  const code = starterCode();
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("pending_email_signups").upsert(
    {
      user_id: userId,
      email,
      code_hash: hashCode(code),
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
      attempts: 0,
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);

  try {
    await sendStarterCode(email, code);
  } catch (sendError) {
    await admin.from("pending_email_signups").delete().eq("user_id", userId);
    throw sendError;
  }

  return { mode: "code" };
}

export async function verifyEmailCode(
  userId: string,
  rawEmail: string,
  code: string,
  password: string,
): Promise<EmailBranch | { mode: "ok" }> {
  const email = normalizeEmail(rawEmail);
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("pending_email_signups")
    .select("email, code_hash, expires_at, attempts")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.email !== email) throw new Error("wrong_code");
  if (data.attempts >= MAX_ATTEMPTS) {
    throw new Error("rate_limited");
  }
  if (new Date(data.expires_at).getTime() <= Date.now()) {
    throw new Error("expired");
  }
  if (!codesMatch(code.trim(), data.code_hash)) {
    await admin
      .from("pending_email_signups")
      .update({ attempts: data.attempts + 1 })
      .eq("user_id", userId);
    throw new Error("wrong_code");
  }
  const chosen = password.trim();
  if (chosen.length < 8) throw new Error("short_password");

  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    email,
    password: chosen,
    email_confirm: true,
  });
  if (updateError) {
    if (emailTaken(updateError)) {
      await admin.from("pending_email_signups").delete().eq("user_id", userId);
      return { mode: "login", hasCard: await sessionHasCard(userId) };
    }
    throw new Error(updateError.message);
  }

  await admin.from("pending_email_signups").delete().eq("user_id", userId);
  return { mode: "ok" };
}

/**
 * Asks the signed-in person to prove a new address. The starter code is only a check.
 * It does not become the password.
 */
export async function startEmailChange(userId: string, rawEmail: string): Promise<{ mode: "code" }> {
  const email = normalizeEmail(rawEmail);
  if (!isEmail(email)) throw new Error("Enter an email");

  const existing = await userIdForEmail(email);
  if (existing === userId) throw new Error("That's already your email");
  if (existing) throw new Error("That email is already in use");

  if (!mailConfigured()) throw new Error("mail_not_configured");

  const code = starterCode();
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("pending_email_signups").upsert(
    {
      user_id: userId,
      email,
      code_hash: hashCode(code),
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
      attempts: 0,
      purpose: "change",
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);

  try {
    await sendChangeCode(email, code);
  } catch (sendError) {
    await admin.from("pending_email_signups").delete().eq("user_id", userId);
    throw sendError;
  }

  return { mode: "code" };
}

/** Confirms the new address and leaves the current password where it is. */
export async function verifyEmailChange(userId: string, rawEmail: string, code: string): Promise<{ mode: "ok" }> {
  const email = normalizeEmail(rawEmail);
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("pending_email_signups")
    .select("email, code_hash, expires_at, attempts, purpose")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.email !== email || data.purpose !== "change") throw new Error("wrong_code");
  if (data.attempts >= MAX_ATTEMPTS) throw new Error("rate_limited");
  if (new Date(data.expires_at).getTime() <= Date.now()) throw new Error("expired");
  if (!codesMatch(code.trim(), data.code_hash)) {
    await admin
      .from("pending_email_signups")
      .update({ attempts: data.attempts + 1 })
      .eq("user_id", userId);
    throw new Error("wrong_code");
  }

  const { data: current, error: readError } = await admin.auth.admin.getUserById(userId);
  if (readError) throw new Error(readError.message);
  const previous = current.user?.email?.trim().toLowerCase() ?? "";
  if (previous) {
    const { error: archiveError } = await admin.from("email_history").insert({
      user_id: userId,
      email: previous,
    });
    if (archiveError) throw new Error(archiveError.message);
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
  });
  if (updateError) {
    if (emailTaken(updateError)) {
      await admin.from("pending_email_signups").delete().eq("user_id", userId);
      throw new Error("That email is already in use");
    }
    throw new Error(updateError.message);
  }

  await admin.from("pending_email_signups").delete().eq("user_id", userId);
  return { mode: "ok" };
}

/** Sends a reset link when the address belongs to an account. The response does not say which. */
export async function sendResetLink(rawEmail: string, origin: string): Promise<boolean> {
  if (!mailConfigured()) throw new Error("mail_not_configured");
  const email = normalizeEmail(rawEmail);
  const existing = await userIdForEmail(email);
  if (!existing) return false;

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (error) throw new Error(error.message);
  const hashed = data.properties?.hashed_token;
  if (!hashed) throw new Error("No reset link");
  const link = `${origin}/auth/reset?token_hash=${encodeURIComponent(hashed)}`;
  await sendPasswordReset(email, link);
  return true;
}

type MailGate = { ok: true; markSent: () => Promise<void> } | { ok: false; status: 429; error: string };

async function sweepMail(admin: ReturnType<typeof createAdminSupabaseClient>) {
  const since = new Date(Date.now() - MAIL_HOUR_MS).toISOString();
  const dropped = await admin.from("auth_mail_sends").delete().lt("created_at", since);
  if (dropped.error) throw new Error(dropped.error.message);
  const expired = await admin.from("email_signup_codes").delete().lt("expires_at", new Date().toISOString());
  if (expired.error) throw new Error(expired.error.message);
}

async function countSends(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  column: "email_hash" | "ip_hash",
  value: string,
  sentOnly: boolean,
  kind?: "signup" | "reset",
) {
  if (column === "ip_hash" && !value) return 0;
  const since = new Date(Date.now() - MAIL_HOUR_MS).toISOString();
  let query = admin
    .from("auth_mail_sends")
    .select("id", { count: "exact", head: true })
    .eq(column, value)
    .gte("created_at", since);
  if (sentOnly) query = query.eq("sent", true);
  if (kind) query = query.eq("kind", kind);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function lastSignupLetter(admin: ReturnType<typeof createAdminSupabaseClient>, emailHash: string) {
  const { data, error } = await admin
    .from("auth_mail_sends")
    .select("created_at")
    .eq("email_hash", emailHash)
    .eq("kind", "signup")
    .eq("sent", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const at = data?.created_at;
  return typeof at === "string" ? new Date(at).getTime() : null;
}

async function noteRequest(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  emailHash: string,
  ipHash: string,
  kind: "signup" | "reset",
) {
  const { data, error } = await admin
    .from("auth_mail_sends")
    .insert({ email_hash: emailHash, ip_hash: ipHash, kind, sent: false })
    .select("id")
    .single();
  if (error || !data?.id) throw new Error(error?.message ?? "mail count");
  return String(data.id);
}

function markSent(admin: ReturnType<typeof createAdminSupabaseClient>, id: string) {
  return async () => {
    const { error } = await admin.from("auth_mail_sends").update({ sent: true }).eq("id", id);
    if (error) throw new Error(error.message);
  };
}

/**
 * One reset request. The sixth request for an address in an hour is refused
 * even when no letter was sent, so the answer does not change.
 */
export async function prepareResetMail(rawEmail: string, ip: string): Promise<MailGate> {
  const email = normalizeEmail(rawEmail);
  const admin = createAdminSupabaseClient();
  await sweepMail(admin);
  const emailHash = mailLimitKey("email", email);
  const ipHash = mailIpHash(ip);
  if ((await countSends(admin, "ip_hash", ipHash, false)) >= MAIL_PER_IP) {
    return { ok: false, status: 429, error: TRY_LATER };
  }
  if ((await countSends(admin, "email_hash", emailHash, false, "reset")) >= MAIL_PER_EMAIL) {
    return { ok: false, status: 429, error: TRY_LATER };
  }
  const id = await noteRequest(admin, emailHash, ipHash, "reset");
  return { ok: true, markSent: markSent(admin, id) };
}

/**
 * Ask for a signup code. The account is not created. The password is not an argument.
 * A taken address gets a different letter and the same success.
 */
export async function beginSignupCode(
  rawEmail: string,
  ip: string,
  origin: string,
  resend: boolean,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const email = normalizeEmail(rawEmail);
  if (!isEmail(email)) return { ok: false, status: 400, error: "Add your email." };
  const admin = createAdminSupabaseClient();
  await sweepMail(admin);
  const emailHash = mailLimitKey("email", email);
  const ipHash = mailIpHash(ip);
  const requests = await countSends(admin, "ip_hash", ipHash, false);
  const letters = await countSends(admin, "email_hash", emailHash, true, "signup");
  const lastLetterAt = await lastSignupLetter(admin, emailHash);
  const { data: saved, error: readError } = await admin
    .from("email_signup_codes")
    .select("expires_at")
    .eq("email", email)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  const taken = Boolean(await userIdForEmail(email));
  if (taken) {
    const removed = await admin.from("email_signup_codes").delete().eq("email", email);
    if (removed.error) throw new Error(removed.error.message);
  }
  const plan = planSignupMail({
    now: Date.now(),
    resend,
    taken,
    row: taken || !saved?.expires_at ? null : { expiresAt: new Date(saved.expires_at).getTime() },
    letters,
    requests,
    lastLetterAt,
    nextCode: digitCode(),
  });
  if (plan.kind === "limited" && requests >= MAIL_PER_IP) return { ok: false, status: 429, error: plan.error };
  const requestId = await noteRequest(admin, emailHash, ipHash, "signup");
  if (plan.kind === "limited") return { ok: false, status: 429, error: plan.error };
  if (plan.kind === "quiet") return { ok: true };
  if (!mailConfigured()) return { ok: false, status: 503, error: MAIL_NOT_CONNECTED };

  if (plan.kind === "code") {
    const { error } = await admin.from("email_signup_codes").upsert(
      {
        email,
        code_hash: hashCode(plan.code),
        expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
        attempts: 0,
        sent_at: new Date().toISOString(),
      },
      { onConflict: "email" },
    );
    if (error) throw new Error(error.message);
    try {
      const mail = signupCodeMail({ logoSrc: `${origin}/brand/aded-grid-mail.png`, code: plan.code });
      await sendHtmlMail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
    } catch (error) {
      await admin.from("email_signup_codes").delete().eq("email", email);
      throw error;
    }
  } else {
    const mail = signupTakenMail({ logoSrc: `${origin}/brand/aded-grid-mail.png` });
    await sendHtmlMail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
  }
  await markSent(admin, requestId)();
  return { ok: true };
}

/** Check the signup code and delete it when it matches. Does not create the account. */
export async function verifySignupCode(rawEmail: string, code: string): Promise<"ok" | "wrong" | "expired" | "limited"> {
  const email = normalizeEmail(rawEmail);
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("email_signup_codes")
    .select("code_hash, expires_at, attempts")
    .eq("email", email)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row =
    data && typeof data.code_hash === "string"
      ? {
          hash: data.code_hash,
          expiresAt: new Date(data.expires_at).getTime(),
          attempts: typeof data.attempts === "number" ? data.attempts : 0,
        }
      : null;
  const verdict = judgeSignupCode({ now: Date.now(), code, row });
  if (verdict === "wrong" && row) {
    await admin.from("email_signup_codes").update({ attempts: row.attempts + 1 }).eq("email", email);
  }
  if (verdict === "missing" || verdict === "wrong") return "wrong";
  if (verdict !== "ok") return verdict;
  const removed = await admin.from("email_signup_codes").delete().eq("email", email);
  if (removed.error) throw new Error(removed.error.message);
  return "ok";
}
