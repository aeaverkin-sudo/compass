import type { CardSnapshot } from "@/shared/types";

export type ShareEntry = {
  snapshot: CardSnapshot;
  ownerName: string;
  createdAt: number;
  viewCount: number;
};

const globalStore = globalThis as typeof globalThis & {
  __compassShareStore?: Map<string, ShareEntry>;
};

export const shareStore: Map<string, ShareEntry> =
  globalStore.__compassShareStore ?? new Map<string, ShareEntry>();

if (!globalStore.__compassShareStore) {
  globalStore.__compassShareStore = shareStore;
}

export function upsertShare(token: string, snapshot: CardSnapshot, ownerName: string) {
  const existing = shareStore.get(token);
  shareStore.set(token, {
    snapshot,
    ownerName,
    createdAt: existing?.createdAt ?? Date.now(),
    viewCount: existing?.viewCount ?? 0,
  });
}

export function getShare(token: string) {
  return shareStore.get(token);
}
