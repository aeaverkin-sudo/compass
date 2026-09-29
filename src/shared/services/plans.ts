/** Plan ceilings. The database trigger uses the same portfolio counts. */

export type PlanId = "free" | "paid";

export type PlanLimits = {
  portfolios: number;
  bytes: number;
};

export const PLANS: Record<PlanId, PlanLimits> = {
  free: { portfolios: 3, bytes: 500 * 1024 * 1024 },
  paid: { portfolios: 10, bytes: 5 * 500 * 1024 * 1024 },
};

export function planId(value: string | null | undefined): PlanId {
  return value === "paid" ? "paid" : "free";
}

export function planLimits(plan: PlanId): PlanLimits {
  return PLANS[plan];
}

export function planCatalog(): Record<PlanId, PlanLimits> {
  return { free: PLANS.free, paid: PLANS.paid };
}
