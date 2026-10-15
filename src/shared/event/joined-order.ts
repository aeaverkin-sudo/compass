type Row = { role: "owner" | "manager" | "guest"; joinedAt?: string | null };

function joinedTime(row: Row): number {
  const time = row.joinedAt ? new Date(row.joinedAt).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

/**
 * Events the person organises keep their places. The events they go to fill
 * the remaining places in the order they confirmed going.
 */
export function guestsByJoined<T extends Row>(rows: T[]): T[] {
  const guests = rows.filter((row) => row.role === "guest").sort((left, right) => joinedTime(left) - joinedTime(right));
  let next = 0;
  return rows.map((row) => (row.role === "guest" ? guests[next++] : row));
}
