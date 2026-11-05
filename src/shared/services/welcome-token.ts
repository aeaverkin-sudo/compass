import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";

const TOKEN_RE = /^[A-Za-z0-9_-]{43,128}$/;
const DUMMY = Buffer.alloc(32);

export function mintWelcomeToken(): string {
  return randomBytes(32).toString("base64url");
}

function digest(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

export function welcomeTokenHash(token: string): string {
  return digest(token).toString("hex");
}

function sameHash(storedHex: string, token: string): boolean {
  const computed = digest(token);
  const stored = Buffer.from(storedHex, "hex");
  if (stored.length !== computed.length) {
    timingSafeEqual(computed, DUMMY);
    return false;
  }
  return timingSafeEqual(stored, computed);
}

export async function saveWelcomeToken(userId: string, token: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  const saved = await admin
    .from("profiles")
    .update({ welcome_token_hash: welcomeTokenHash(token), welcome_token_active: true })
    .eq("id", userId);
  if (saved.error) throw new Error(saved.error.message);
}

/** The letter stops signing in. The hash stays, so the same link can still name the email. */
export async function closeWelcomeToken(userId: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  const saved = await admin.from("profiles").update({ welcome_token_active: false }).eq("id", userId);
  if (saved.error) throw new Error(saved.error.message);
}

export type WelcomeDoor =
  | { kind: "open"; email: string }
  | { kind: "signin"; email?: string };

/** A missing or closed token never signs in. A closed token still carries the email. */
export async function resolveWelcomeToken(token: string): Promise<WelcomeDoor> {
  if (!TOKEN_RE.test(token)) {
    timingSafeEqual(digest(token || "x"), DUMMY);
    return { kind: "signin" };
  }
  const admin = createAdminSupabaseClient();
  const hash = welcomeTokenHash(token);
  const row = await admin
    .from("profiles")
    .select("id, welcome_token_hash, welcome_token_active")
    .eq("welcome_token_hash", hash)
    .maybeSingle();
  if (row.error) throw new Error(row.error.message);
  const data = row.data as { id: string; welcome_token_hash: string | null; welcome_token_active: boolean } | null;
  if (!data?.welcome_token_hash || !sameHash(data.welcome_token_hash, token)) {
    timingSafeEqual(digest(token), DUMMY);
    return { kind: "signin" };
  }
  const user = (await admin.auth.admin.getUserById(data.id)).data.user;
  const email = user?.email?.trim().toLowerCase() || undefined;
  if (!data.welcome_token_active || !email) return { kind: "signin", email };
  return { kind: "open", email };
}
