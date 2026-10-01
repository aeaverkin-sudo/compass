import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { mailConfigured, sendChangeCode, sendPasswordReset, sendStarterCode } from "@/shared/services/mail";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_TTL_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 8;

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

function starterCode() {
  let code = "";
  for (let i = 0; i < 8; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

function codesMatch(code: string, hash: string) {
  const next = Buffer.from(hashCode(code));
  const prev = Buffer.from(hash);
  if (next.length !== prev.length) return false;
  return timingSafeEqual(next, prev);
}

function emailTaken(error: { message?: string; code?: string } | null) {
  const text = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  return text.includes("already") || text.includes("email_exists") || text.includes("duplicate");
}

async function userIdForEmail(email: string): Promise<string | null> {
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

  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    email,
    password: code.trim(),
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
export async function sendResetLink(rawEmail: string, origin: string) {
  if (!mailConfigured()) throw new Error("mail_not_configured");
  const email = normalizeEmail(rawEmail);
  const existing = await userIdForEmail(email);
  if (!existing) return;

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${origin}/auth/reset` },
  });
  if (error) throw new Error(error.message);
  const link = data.properties?.action_link;
  if (!link) throw new Error("No reset link");
  await sendPasswordReset(email, link);
}
