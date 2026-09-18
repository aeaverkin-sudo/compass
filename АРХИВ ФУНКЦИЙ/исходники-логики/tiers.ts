import type { SubscriptionTier } from "@/shared/types";

export const TIER_LIMITS: Record<
  SubscriptionTier,
  { maxPortfolios: number; maxSlots: number; label: string }
> = {
  free: { maxPortfolios: 2, maxSlots: 5, label: "Free" },
  business: { maxPortfolios: 5, maxSlots: 15, label: "Business" },
  professional: { maxPortfolios: 10, maxSlots: 30, label: "Professional" },
  conference: { maxPortfolios: 10, maxSlots: 30, label: "Conference Package" },
};
