import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { planCatalog, planId, planLimits, type PlanId } from "@/shared/services/plans";

const HOUR_MS = 60 * 60 * 1000;

export const TRIAL_MS = 60 * HOUR_MS;
export const GRACE_MS = 40 * HOUR_MS;
export const PURGE_AFTER_MS = TRIAL_MS + GRACE_MS;

export type AccountProvider = "email" | "google" | null;

export type AccountStatus = {
  registered: boolean;
  /** Clock has started and the person has not registered. */
  trial: boolean;
  /** Past 60 hours, still inside the 40-hour window before deletion. */
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
  /** An unkept event guest account. Null for everyone else. */
  eventPass?: EventPassStatus | null;
  /** Account settings for event registrations. On until turned off. */
  sharing?: { analytics: boolean; connections: boolean };
};

export type EventPassCard = { cardId: string; eventName: string; ended: boolean };

export type EventPassStatus = {
  passes: EventPassCard[];
  /** Deletion moment: the latest event end + 100h. */
  deleteAt: string | null;
  /** A confirmed email keeps the profile with one tap. A phone guest registers. */
  keepByTap: boolean;
  /** No email on the account and none waiting: the pass offers to add one. */
  needsEmail: boolean;
  /** An email sent for confirmation and not confirmed yet. */
  pendingEmail: string | null;
};

type ProfileClock = {
  draft_expires_at: string | null;
  purge_at: string | null;
  registered_at: string | null;
  plan: string | null;
  /** Personal portfolio ceiling. Null uses the plan limit. */
  portfolio_limit: number | null;
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
  const portfolioLimit =
    typeof row?.portfolio_limit === "number" && row.portfolio_limit > 0
      ? row.portfolio_limit
      : limits.portfolios;
  return {
    ...clockFrom(row, now),
    email: null,
    provider: null,
    consentVersion: null,
    plan,
    portfolioLimit,
    bytesUsed: 0,
    bytesLimit: limits.bytes,
    catalog: planCatalog(),
  };
}

async function readClock(userId: string): Promise<ProfileClock | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("profiles")
    .select("draft_expires_at, purge_at, registered_at, plan, portfolio_limit")
    .eq("id", userId)
    .maybeSingle();
  if (!error) return (data as ProfileClock | null) ?? null;

  // portfolio_limit arrives with this migration. Until then the plan ceiling stays.
  if (/portfolio_limit/i.test(error.message)) {
    const kept = await admin
      .from("profiles")
      .select("draft_expires_at, purge_at, registered_at, plan")
      .eq("id", userId)
      .maybeSingle();
    if (!kept.error) {
      if (!kept.data) return null;
      return { ...(kept.data as Omit<ProfileClock, "portfolio_limit">), portfolio_limit: null };
    }
    if (!/plan/i.test(kept.error.message)) throw new Error(kept.error.message);
  } else if (!/plan/i.test(error.message)) {
    throw new Error(error.message);
  }

  // The plan column is optional until phase 9 is applied. An unset plan is free.
  const fallback = await admin
    .from("profiles")
    .select("draft_expires_at, purge_at, registered_at")
    .eq("id", userId)
    .maybeSingle();
  if (fallback.error) throw new Error(fallback.error.message);
  if (!fallback.data) return null;
  return {
    ...(fallback.data as Omit<ProfileClock, "plan" | "portfolio_limit">),
    plan: null,
    portfolio_limit: null,
  };
}

export async function readAccountStatus(userId: string): Promise<AccountStatus> {
  return statusFrom(await readClock(userId));
}

/** Starts the 60h / 100h clock once. A second call does not move it. */
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

const EVENT_LENGTH_MS = 12 * HOUR_MS;

/** End of the event for a guest clock. No end: start + 12h. No date: the moment of acceptance. */
export function eventGuestEnd(event: { date: string | null; endsAt: string | null }, acceptedAt = Date.now()): number {
  const end = event.endsAt ? new Date(event.endsAt).getTime() : Number.NaN;
  if (Number.isFinite(end)) return end;
  const start = event.date ? new Date(event.date).getTime() : Number.NaN;
  if (Number.isFinite(start)) return start + EVENT_LENGTH_MS;
  return acceptedAt;
}

/** An event guest's card lives this long after the event ends. No freeze in between. */
export const EVENT_GUEST_MS = 100 * HOUR_MS;

/**
 * One stage: deletion at the event end + 100h, and the draft clock ends at the same moment.
 * A guest of two events keeps the later clock. A registered account has no clock.
 */
export async function startEventGuestClock(userId: string, eventEnd: number): Promise<void> {
  const current = await readClock(userId);
  if (current?.registered_at) return;
  let purge = eventEnd + EVENT_GUEST_MS;
  const keptPurge = current?.purge_at ? new Date(current.purge_at).getTime() : Number.NaN;
  if (Number.isFinite(keptPurge)) purge = Math.max(purge, keptPurge);

  const admin = createAdminSupabaseClient();
  const at = new Date(purge).toISOString();
  const clock = { draft_expires_at: at, purge_at: at };
  const marked = await admin.from("profiles").update({ ...clock, event_trial: true }).eq("id", userId).is("registered_at", null);
  if (!marked.error) return;
  if (!/event_trial/i.test(marked.error.message)) throw new Error(marked.error.message);
  const kept = await admin.from("profiles").update(clock).eq("id", userId).is("registered_at", null);
  if (kept.error) throw new Error(kept.error.message);
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
