/** A library row the client asked to reuse. New typed rows have no itemId. */
export type LibraryRow = { itemId: string | null; onCard: boolean };

type OwnerRead = {
  data: { id: string }[] | null;
  error: { message: string } | null;
};

/** Every library id the client sent, once, in first-seen order. */
export function libraryItemIds(zones: readonly { rows: readonly { itemId: string | null }[] }[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const zone of zones) {
    for (const row of zone.rows) {
      if (!row.itemId || seen.has(row.itemId)) continue;
      seen.add(row.itemId);
      ids.push(row.itemId);
    }
  }
  return ids;
}

export function ownedIdSet(rows: readonly { id?: string }[] | null | undefined): Set<string> {
  const owned = new Set<string>();
  for (const row of rows ?? []) {
    if (row.id) owned.add(row.id);
  }
  return owned;
}

/** Library rows this account does not own are removed. Typed rows stay. */
export function dropUnownedItemRows<T extends { rows: readonly LibraryRow[] }>(
  zones: readonly T[],
  owned: ReadonlySet<string>,
): T[] {
  return zones.map((zone) => ({
    ...zone,
    rows: zone.rows.filter((row) => !row.itemId || owned.has(row.itemId)),
  }));
}

export type LibraryPlan = {
  itemZones: Record<string, string>;
  linked: string[];
};

/** Where an owned library row is filed, and which of those rows join the card. */
export function libraryPlan(
  zones: readonly { id: string; rows: readonly LibraryRow[] }[],
  owned: ReadonlySet<string>,
): LibraryPlan {
  const itemZones: Record<string, string> = {};
  const linked: string[] = [];
  for (const zone of zones) {
    for (const row of zone.rows) {
      if (!row.itemId || !owned.has(row.itemId)) continue;
      itemZones[row.itemId] = zone.id;
      if (row.onCard) linked.push(row.itemId);
    }
  }
  return { itemZones, linked };
}

/**
 * One read of the caller's items. A database error throws here, before any card exists.
 * Ids the read does not return are dropped.
 */
export async function libraryZonesBeforeCard<T extends { rows: readonly LibraryRow[] }>(
  zones: readonly T[],
  load: (ids: string[]) => Promise<OwnerRead>,
): Promise<T[]> {
  const ids = libraryItemIds(zones);
  if (ids.length === 0) return zones.map((zone) => ({ ...zone }));
  const found = await load(ids);
  if (found.error) throw new Error(found.error.message);
  return dropUnownedItemRows(zones, ownedIdSet(found.data));
}
