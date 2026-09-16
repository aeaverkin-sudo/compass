import type { CardSnapshot } from "@/shared/types";

export interface ShareEntry {
  portfolio: CardSnapshot;
  ownerName: string;
  createdAt: number;
  nextScanDelivered?: boolean;
  viewCount: number;
}

const globalForShare = globalThis as unknown as { shareStore?: Map<string, ShareEntry> };

export const shareStore = globalForShare.shareStore ?? new Map<string, ShareEntry>();

if (!globalForShare.shareStore) {
  globalForShare.shareStore = shareStore;
}

export function getSharePayload(entry: ShareEntry) {
  const includeAddon =
    entry.portfolio.nextScanAddon && !entry.nextScanDelivered;
  return {
    portfolio: {
      ...entry.portfolio,
      nextScanAddon: includeAddon ? entry.portfolio.nextScanAddon : null,
    },
    ownerName: entry.ownerName,
    createdAt: entry.createdAt,
  };
}

export function markShareViewed(token: string): ShareEntry | null {
  const entry = shareStore.get(token);
  if (!entry) return null;
  entry.viewCount += 1;
  if (entry.portfolio.nextScanAddon && !entry.nextScanDelivered) {
    entry.nextScanDelivered = true;
  }
  shareStore.set(token, entry);
  return entry;
}
