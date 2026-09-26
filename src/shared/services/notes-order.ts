import type { NextScanAddon, NextScanAddonType } from "@/shared/types";

const TYPE_RANK: Record<NextScanAddonType, number> = {
  text: 0,
  selfie: 1,
  voice: 2,
};

/** One of each type. Voice is always last. */
export function orderNextScanAddons(addons: NextScanAddon[]): NextScanAddon[] {
  const picked = new Map<NextScanAddonType, NextScanAddon>();
  for (const addon of addons) {
    if (!picked.has(addon.type)) picked.set(addon.type, addon);
  }
  return [...picked.values()].sort((a, b) => TYPE_RANK[a.type] - TYPE_RANK[b.type]);
}
