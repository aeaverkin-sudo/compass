import { crc32 } from "node:zlib";

/** A stored file is this person's only when both the row and the path say so. */
export function fileBelongsToOwner(ownerId: string, row: { owner_id: string; storage_path: string }) {
  if (!ownerId || row.owner_id !== ownerId) return false;
  return row.storage_path === ownerId || row.storage_path.startsWith(`${ownerId}/`);
}

export function ownedAttachmentId(id: unknown, owned: ReadonlySet<string>) {
  return typeof id === "string" && owned.has(id) ? id : null;
}

export type ExportFileRef = { id: string; name: string; included: boolean };

/** A contact file is listed only when its bytes are in this zip. Other people's files are omitted. */
export function contactFileRefs(
  ownerId: string,
  files: { id?: unknown; name?: unknown }[],
  packed: ReadonlySet<string>,
): ExportFileRef[] {
  if (!ownerId) return [];
  const refs: ExportFileRef[] = [];
  for (const file of files) {
    if (!file || typeof file.id !== "string" || !packed.has(file.id)) continue;
    const name = typeof file.name === "string" && file.name.trim() ? file.name.trim() : "File";
    refs.push({ id: file.id, name, included: true });
  }
  return refs;
}

/** PostgREST stops a select at the project row cap. Read until a short page, and fail if a page errors. */
export const EXPORT_PAGE_SIZE = 1000;

export async function readAllPages(
  query: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  pageSize = EXPORT_PAGE_SIZE,
): Promise<Record<string, unknown>[]> {
  if (pageSize < 1) throw new Error("Could not read your data.");
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += pageSize) {
    const loaded = await query(from, from + pageSize - 1);
    if (loaded.error) throw new Error(loaded.error.message);
    const page = loaded.data ?? [];
    for (const row of page) rows.push(row as Record<string, unknown>);
    if (page.length < pageSize) return rows;
  }
}

const PROTECTED_COLUMNS = new Set([
  "id",
  "owner_id",
  "user_id",
  "card_id",
  "item_id",
  "attachment_id",
  "photo_attachment_id",
]);

/**
 * Drop a column only when Postgres or PostgREST names that exact optional column.
 * `id` is not a match for `photo_attachment_id`. Links and ids are never dropped.
 */
export function optionalColumnToDrop(
  message: string,
  selected: readonly string[],
  optional: readonly string[],
): string | null {
  if (!/column|schema/i.test(message)) return null;
  const allowed = new Map<string, string>();
  for (const column of optional) {
    if (!selected.includes(column) || PROTECTED_COLUMNS.has(column)) continue;
    allowed.set(column.toLowerCase(), column);
  }
  for (const name of columnNames(message)) {
    const column = allowed.get(name.toLowerCase());
    if (column) return column;
  }
  return null;
}

/** The column is the last identifier. `external_contacts.header_field` names header_field, not the table. */
function columnNames(message: string) {
  const names: string[] = [];
  const take = (token: string) => {
    const column = token.split(".").pop()?.replace(/"/g, "") ?? "";
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(column)) names.push(column);
  };
  for (const match of message.matchAll(/column\s+"([^"]+)"/gi)) take(match[1]);
  for (const match of message.matchAll(/'([^']+)'\s+column/gi)) take(match[1]);
  for (const match of message.matchAll(/\bcolumn\s+([A-Za-z_][A-Za-z0-9_.]*)/gi)) take(match[1]);
  return names;
}

export const EXPORT_README = [
  "ADED account copy",
  "",
  "account.json holds this account only:",
  "- profile, the consent version you accepted, and the sign-in provider",
  "- portfolios you own, and the library rows on those portfolios",
  "- contacts you added by hand, with the files you uploaded for them",
  "",
  "files/ holds the original portfolio and library files.",
  "contacts/ holds the original files of contacts you added by hand.",
  "account.json names a file only when that file is in this zip.",
  "A file is included only when it belongs to this account and its bytes were packed.",
  "",
  "Other people's portfolios are not in this copy, even if they are in your Network.",
  "Their files are not included.",
  "",
  "This is the machine-readable copy of your account (GDPR article 20).",
  "A broader access request (GDPR article 15) can cover more than this file.",
  "Email support@adedme.com. We confirm it is you and reply within one month.",
  "",
].join("\n");

type ZipFile = { name: string; data: Uint8Array };

function u16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function u32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true);
}

function dosStamp(date: Date) {
  const year = Math.max(1980, date.getUTCFullYear());
  const time = (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1);
  const day = ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate();
  return { time, day };
}

export type ZipEntry = { parts: Uint8Array[]; central: Uint8Array; next: number };

/** One stored file: the local header and bytes, plus the central-directory record for the end. */
export function zipEntry(file: ZipFile, offset: number, now = new Date()): ZipEntry {
  const stamp = dosStamp(now);
  const name = new TextEncoder().encode(file.name);
  const crc = crc32(file.data) >>> 0;
  const local = new Uint8Array(30 + name.length);
  const localView = new DataView(local.buffer);
  u32(localView, 0, 0x04034b50);
  u16(localView, 4, 20);
  u16(localView, 6, 0x0800);
  u16(localView, 8, 0);
  u16(localView, 10, stamp.time);
  u16(localView, 12, stamp.day);
  u32(localView, 14, crc);
  u32(localView, 18, file.data.length);
  u32(localView, 22, file.data.length);
  u16(localView, 26, name.length);
  u16(localView, 28, 0);
  local.set(name, 30);

  const central = new Uint8Array(46 + name.length);
  const centralView = new DataView(central.buffer);
  u32(centralView, 0, 0x02014b50);
  u16(centralView, 4, 20);
  u16(centralView, 6, 20);
  u16(centralView, 8, 0x0800);
  u16(centralView, 10, 0);
  u16(centralView, 12, stamp.time);
  u16(centralView, 14, stamp.day);
  u32(centralView, 16, crc);
  u32(centralView, 20, file.data.length);
  u32(centralView, 24, file.data.length);
  u16(centralView, 28, name.length);
  u16(centralView, 30, 0);
  u16(centralView, 32, 0);
  u16(centralView, 34, 0);
  u16(centralView, 36, 0);
  u32(centralView, 38, 0);
  u32(centralView, 42, offset);
  central.set(name, 46);
  return { parts: [local, file.data], central, next: offset + local.length + file.data.length };
}

export function zipEnd(centrals: Uint8Array[], offset: number, count: number): Uint8Array[] {
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  u32(endView, 0, 0x06054b50);
  u16(endView, 4, 0);
  u16(endView, 6, 0);
  u16(endView, 8, count);
  u16(endView, 10, count);
  u32(endView, 12, centralSize);
  u32(endView, 16, offset);
  u16(endView, 20, 0);
  return [...centrals, end];
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

/** A zip of stored files. Names are UTF-8. Nothing is compressed. */
export function zipStored(files: ZipFile[], now = new Date()): Uint8Array {
  return concat([...zipStream(files, now)]);
}

/** Local bytes first, then the directory. Each file can be released after it is yielded. */
export function* zipStream(files: Iterable<ZipFile>, now = new Date()): Generator<Uint8Array> {
  const centrals: Uint8Array[] = [];
  let offset = 0;
  let count = 0;
  for (const file of files) {
    const entry = zipEntry(file, offset, now);
    yield* entry.parts;
    centrals.push(entry.central);
    offset = entry.next;
    count += 1;
  }
  yield* zipEnd(centrals, offset, count);
}
