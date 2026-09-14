import type { PortfolioSnapshot } from "@/shared/types";

interface ShareEntry {
  portfolio: PortfolioSnapshot;
  ownerName: string;
  createdAt: number;
}

const globalForShare = globalThis as unknown as { shareStore?: Map<string, ShareEntry> };

export const shareStore = globalForShare.shareStore ?? new Map<string, ShareEntry>();

if (!globalForShare.shareStore) {
  globalForShare.shareStore = shareStore;
}
