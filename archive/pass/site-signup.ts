import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { MIN_PASSWORD } from "@/shared/services/cold-entry";
import { isEmail, userIdForEmail } from "@/shared/services/email-signup";
import { isPermanentAccount, PASSWORD_SET, type SessionUser } from "@/shared/services/member-account";
import { clearTrialClock } from "@/shared/services/trial";

export type SiteSignupResult =
  | { ok: true; kind: "created" }
  | { ok: true; kind: "login" }
  | { ok: true; kind: "go"; next: string }
  | { ok: false; status: number; error: string };

function emailTaken(error: { message?: string; code?: string } | null) {
  const text = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  return text.includes("already") || text.includes("email_exists") || text.includes("duplicate");
}

/** Turns this browser's session into an account with the password shown on the form. Nothing is created before Create. */
export async function createSiteAccount(
  session: SessionUser,
  input: { email: unknown; password: unknown },
): Promise<SiteSignupResult> {
  if (!session) return { ok: false, status: 401, error: "Open the page again." };
  if (await isPermanentAccount(session)) return { ok: true, kind: "go", next: "/main" };

  const email = (typeof input.email === "string" ? input.email : "").trim().toLowerCase();
  if (!email || email.length > 254 || !isEmail(email)) return { ok: false, status: 400, error: "Add your email." };
  const password = typeof input.password === "string" ? input.password.trim() : "";
  if (password.length < MIN_PASSWORD) {
    return { ok: false, status: 400, error: `Use at least ${MIN_PASSWORD} characters for the password.` };
  }

  const owner = await userIdForEmail(email);
  if (owner && owner !== session.id) return { ok: true, kind: "login" };

  const admin = createAdminSupabaseClient();
  const current = (await admin.auth.admin.getUserById(session.id)).data.user;
  const updated = await admin.auth.admin.updateUserById(session.id, {
    email,
    password,
    email_confirm: true,
    app_metadata: { ...current?.app_metadata, [PASSWORD_SET]: new Date().toISOString() },
  });
  if (updated.error) {
    if (emailTaken(updated.error)) return { ok: true, kind: "login" };
    throw new Error(updated.error.message);
  }
  await clearTrialClock(session.id);
  return { ok: true, kind: "created" };
}
