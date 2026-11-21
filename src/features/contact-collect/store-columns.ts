/** Which external_contacts columns this database actually has. A missing column is not a missing table. */

export type ColumnSet = "more" | "header" | "base";

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

/** True only when the external_contacts table itself is absent. */
export function missingTable(error: ColumnError) {
  if (missingOptionalColumn(error)) return false;
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  const message = error.message ?? "";
  return /external_contacts/i.test(message) && /schema cache|does not exist|could not find/i.test(message);
}

/** After a set has worked, keep using it. A fresh look starts from the wide select again. */
export function columnAttempts(known: ColumnSet, fresh: boolean): ColumnSet[] {
  if (fresh || known === "more") return ["more", "header", "base"];
  if (known === "header") return ["header", "base"];
  return ["base"];
}
