import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { planCatalog, planId, planLimits, type PlanId } from "@/shared/services/plans";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const TRIAL_MS = 24 * HOUR_MS;
export const PURGE_AFTER_MS = 7 * DAY_MS;

export type AccountProvider = "email" | "google" | null;

export type AccountStatus = {
  registered: boolean;
  /** Clock has started and the person has not registered. */
  trial: boolean;
  /** Past 24 hours, still inside the 7-day window. */
  frozen: boolean;
  hoursLeft: number | null;
  email: string | null;
  provider: AccountProvider;
  /** Version the person accepted. Null until a consent row exists. */
  consentVersion: string | null;
  plan: PlanId;
  portfolioLimit: number;
  bytesUsed: number;
  bytesLimit: number;
  /** Both plans, so the profile can describe each one. The live ceilings are portfolioLimit and bytesLimit. */
  catalog: Record<PlanId, { portfolios: number; bytes: number }>;
};

type ProfileClock = {
  draft_expires_at: string | null;
  purge_at: string | null;
  registered_at: string | null;
  plan: string | null;
};

function clockFrom(row: ProfileClock | null, now = Date.now()) {
  if (!row || row.registered_at) {
    return { registered: Boolean(row?.registered_at), trial: false, frozen: false, hoursLeft: null as number | null };
  }
  if (!row.draft_expires_at) {
    return { registered: false, trial: false, frozen: false, hoursLeft: null as number | null };
  }
  const expires = new Date(row.draft_expires_at).getTime();
  const frozen = expires <= now;
  const hoursLeft = frozen ? 0 : Math.max(1, Math.ceil((expires - now) / HOUR_MS));
  return { registered: false, trial: true, frozen, hoursLeft };
}

function statusFrom(row: ProfileClock | null, now = Date.now()): AccountStatus {
  const plan = planId(row?.plan);
  const limits = planLimits(plan);
  return {
    ...clockFrom(row, now),
    email: null,
    provider: null,
    consentVersion: null,
    plan,
    portfolioLimit: limits.portfolios,
    bytesUsed: 0,
    bytesLimit: limits.bytes,
    catalog: planCatalog(),
  };
}

async function readClock(userId: string): Promise<ProfileClock | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("profiles")
    .select("draft_expires_at, purge_at, registered_at, plan")
    .eq("id", userId)
    .maybeSingle();
  if (!error) return (data as ProfileClock | null) ?? null;

  // The plan column is optional until phase 9 is applied. An unset plan is free.
  if (!/plan/i.test(error.message)) throw new Error(error.message);

  const fallback = await admin
    .from("profiles")
    .select("draft_expires_at, purge_at, registered_at")
    .eq("id", userId)
    .maybeSingle();
  if (fallback.error) throw new Error(fallback.error.message);
  if (!fallback.data) return null;
  return { ...(fallback.data as Omit<ProfileClock, "plan">), plan: null };
}

export async function readAccountStatus(userId: string): Promise<AccountStatus> {
  return statusFrom(await readClock(userId));
}

/** Starts the 24h / 7d clock once. A second Confirm does not move it. */
export async function startTrialClock(userId: string): Promise<AccountStatus> {
  const current = await readClock(userId);
  if (current?.registered_at || current?.draft_expires_at) return statusFrom(current);

  const now = Date.now();
  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("profiles")
    .update({
      draft_expires_at: new Date(now + TRIAL_MS).toISOString(),
      purge_at: new Date(now + PURGE_AFTER_MS).toISOString(),
    })
    .eq("id", userId)
    .is("registered_at", null)
    .is("draft_expires_at", null);
  if (error) throw new Error(error.message);
  return statusFrom(await readClock(userId));
}

/** True when this owner is an unregistered trial past the 24h mark. Missing columns count as open. */
export async function ownerTrialFrozen(ownerId: string): Promise<boolean> {
  try {
    return (await readAccountStatus(ownerId)).frozen;
  } catch {
    return false;
  }
}

export async function clearTrialClock(userId: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("profiles")
    .update({
      registered_at: now,
      draft_expires_at: null,
      purge_at: null,
    })
    .eq("id", userId);
  if (error) throw new Error(error.message);
}
