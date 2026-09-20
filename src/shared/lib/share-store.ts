import type { CardSnapshot } from "@/shared/types";

export type ShareEntry = {
  snapshot: CardSnapshot;
  ownerName: string;
  createdAt: number;
  viewCount: number;
  nextScanDelivered?: boolean;
};

const globalStore = globalThis as typeof globalThis & {
  __compassShareStore?: Map<string, ShareEntry>;
};

export const shareStore: Map<string, ShareEntry> =
  globalStore.__compassShareStore ?? new Map<string, ShareEntry>();

if (!globalStore.__compassShareStore) {
  globalStore.__compassShareStore = shareStore;
}

function snapshotAddons(snapshot: CardSnapshot) {
  return snapshot.nextScanAddons ?? [];
}

export function getSharePayload(entry: ShareEntry) {
  const addons = snapshotAddons(entry.snapshot);
  const include = addons.length > 0 && !entry.nextScanDelivered;
  return {
    snapshot: {
      ...entry.snapshot,
      nextScanAddons: include ? addons : [],
    },
    ownerName: entry.ownerName,
    createdAt: entry.createdAt,
  };
}

export function markShareViewed(token: string): ShareEntry | null {
  const entry = shareStore.get(token);
  if (!entry) return null;
  entry.viewCount += 1;
  if (snapshotAddons(entry.snapshot).length > 0 && !entry.nextScanDelivered) {
    entry.nextScanDelivered = true;
  }
  shareStore.set(token, entry);
  return entry;
}

export function upsertShare(token: string, snapshot: CardSnapshot, ownerName: string) {
  const existing = shareStore.get(token);
  const hasAddons = snapshotAddons(snapshot).length > 0;

  shareStore.set(token, {
    snapshot,
    ownerName,
    createdAt: existing?.createdAt ?? Date.now(),
    viewCount: existing?.viewCount ?? 0,
    nextScanDelivered: hasAddons ? false : existing?.nextScanDelivered,
  });
}

export function getShare(token: string) {
  return shareStore.get(token);
}
