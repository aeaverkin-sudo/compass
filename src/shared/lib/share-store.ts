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

function snapshotAddons(snapshot: CardSnapshot) {
  if (snapshot.nextScanAddons?.length) return snapshot.nextScanAddons;
  const legacy = snapshot.nextScanAddon;
  return legacy ? [legacy] : [];
}

export function getSharePayload(entry: ShareEntry) {
  const addons = snapshotAddons(entry.portfolio);
  const include = addons.length > 0 && !entry.nextScanDelivered;
  return {
    portfolio: {
      ...entry.portfolio,
      nextScanAddons: include ? addons : [],
      nextScanAddon: null,
    },
    ownerName: entry.ownerName,
    createdAt: entry.createdAt,
  };
}

export function markShareViewed(token: string): ShareEntry | null {
  const entry = shareStore.get(token);
  if (!entry) return null;
  entry.viewCount += 1;
  if (snapshotAddons(entry.portfolio).length > 0 && !entry.nextScanDelivered) {
    entry.nextScanDelivered = true;
  }
  shareStore.set(token, entry);
  return entry;
}
