/** One Edit section, in library order. A check does not move the row. */
export function editRowsInLibraryOrder<T extends { item?: { id: string; order?: number } | null }>(
  rows: T[],
  onCard: ReadonlySet<string>,
): { row: T; onCard: boolean }[] {
  return rows
    .filter((row) => row.item)
    .sort((a, b) => (a.item!.order ?? 0) - (b.item!.order ?? 0))
    .map((row) => ({ row, onCard: onCard.has(row.item!.id) }));
}
