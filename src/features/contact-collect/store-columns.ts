/** Which external_contacts columns this database actually has. A missing column is not a missing table. */

export type ColumnSet = "more" | "moreBase" | "header" | "base";

export type ColumnError = { code?: string; message?: string };

export function missingHeaderColumn(error: ColumnError) {
  return /header_field/i.test(error.message ?? "");
}

export function missingMoreColumn(error: ColumnError) {
  const message = error.message ?? "";
  return /\b(web|social|about|files)\b/i.test(message) && /schema cache|does not exist|could not find/i.test(message);
}

export function missingOptionalColumn(error: ColumnError) {
  return missingHeaderColumn(error) || missingMoreColumn(error);
}

/**
 * True only when Postgres or PostgREST confirms the external_contacts table is absent.
 * A missing column, including a base column, is a different error.
 */
export function missingTable(error: ColumnError) {
  if (error.code === "42703" || missingOptionalColumn(error)) return false;
  const message = error.message ?? "";
  if (/\bcolumn\b/i.test(message)) return false;
  const namesTable =
    /relation\s+"external_contacts"/i.test(message) ||
    /table\s+'public\.external_contacts'/i.test(message) ||
    /table\s+'external_contacts'/i.test(message);
  if (!namesTable) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return /does not exist|schema cache|could not find/i.test(message);
}

/** After a set has worked, keep using it. A fresh look starts from the wide select again. */
export function columnAttempts(known: ColumnSet, fresh: boolean): ColumnSet[] {
  if (fresh || known === "more") return ["more", "moreBase", "header", "base"];
  if (known === "moreBase") return ["moreBase"];
  if (known === "header") return ["header", "base"];
  return ["base"];
}

export type SchemaClock = { known: ColumnSet; fullCheckAt: number };

/** Five minutes from the last wide select, not from a later base read. */
export function planColumns(clock: SchemaClock, now: number, holdMs: number): ColumnSet[] {
  return columnAttempts(clock.known, now - clock.fullCheckAt >= holdMs);
}

/** The wide select is the full-schema check. A narrower read leaves the clock alone. */
export function clockAfterAttempt(clock: SchemaClock, plan: ColumnSet[], now: number): SchemaClock {
  if (plan[0] !== "more") return clock;
  return { ...clock, fullCheckAt: now };
}

export function clockAfterSuccess(clock: SchemaClock, worked: ColumnSet): SchemaClock {
  return { ...clock, known: worked };
}

/**
 * Try the wide select, then More without header_field, then the older sets.
 * A missing optional column moves on. Anything else stops. The clock moves only
 * when the plan starts with the wide select, same as a direct read.
 */
export async function readColumnLadder<T extends { error: ColumnError | null }>(
  clock: SchemaClock,
  now: number,
  holdMs: number,
  run: (set: ColumnSet) => PromiseLike<T>,
): Promise<{ clock: SchemaClock; result: T }> {
  const order = planColumns(clock, now, holdMs);
  const attempted = clockAfterAttempt(clock, order, now);
  let last: T | null = null;
  for (const set of order) {
    const result = await run(set);
    if (!result.error) return { clock: clockAfterSuccess(attempted, set), result };
    last = result;
    if (!missingOptionalColumn(result.error)) return { clock: attempted, result };
  }
  return { clock: attempted, result: last as T };
}
