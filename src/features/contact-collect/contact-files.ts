/** Pure rules for a manual contact's private files. No server and no secrets. */

export const CONTACT_LINK_LIMIT = 12;
export const CONTACT_LINK_MAX = 2048;
export const CONTACT_ABOUT_MAX = 2000;
export const ABOUT_TOO_LONG = "About is too long.";

export type AboutSave =
  | { ok: true; note: string; about?: string }
  | { ok: false; error: typeof ABOUT_TOO_LONG };

/**
 * New and changed text is written to about. An unchanged edit sends the old note and leaves about out,
 * so a joined text longer than the column stays stored in the two old fields.
 * Creating with an empty About omits the column, which keeps a base schema save working.
 */
export function aboutSave(input: {
  editing: boolean;
  changed: boolean;
  text: string;
  storedNote: string;
}): AboutSave {
  if (!input.editing || input.changed) {
    const text = input.text.trim();
    if (text.length > CONTACT_ABOUT_MAX) return { ok: false, error: ABOUT_TOO_LONG };
    if (!input.editing && !text) return { ok: true, note: "" };
    return { ok: true, note: "", about: text };
  }
  return { ok: true, note: input.storedNote };
}

export const CONTACT_FILE_LIMIT = 8;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EXTRA_KEYS = ["web", "social", "files"] as const;

/** Web, Social, and Files stay together. About is its own key and is not part of this count. */
export function extraKeyMode(record: object): "omit" | "partial" | "present" {
  const count = EXTRA_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(record, key)).length;
  if (count === 0) return "omit";
  if (count === EXTRA_KEYS.length) return "present";
  return "partial";
}

export function contactFilePath(ownerId: string, contactId: string, attachmentId: string) {
  return `${ownerId}/${contactId}/${attachmentId}`;
}

export function fileIdsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const id = (entry as { id?: unknown }).id;
    if (typeof id === "string" && UUID.test(id)) ids.push(id);
  }
  return ids;
}

/** Photo ids and linked file ids that purge must keep. */
export function keptContactAttachmentIds(
  candidates: readonly string[],
  photoIds: readonly (string | null | undefined)[],
  fileIds: readonly (string | null | undefined)[],
): string[] {
  const want = new Set(candidates);
  const kept: string[] = [];
  const add = (id: string | null | undefined) => {
    if (!id || !want.has(id) || kept.includes(id)) return;
    kept.push(id);
  };
  for (const id of photoIds) add(id);
  for (const id of fileIds) add(id);
  return kept;
}

/** The contact route serves a file only while the link, owner, and object still match. */
export function contactFileReadable(input: {
  viewerId: string | null;
  ownerId: string;
  linked: boolean;
  status: string;
  bucket: string;
  bucketName: string;
  path: string;
  expectedPath: string;
}): boolean {
  if (!input.viewerId || input.viewerId !== input.ownerId) return false;
  if (!input.linked) return false;
  if (input.status !== "ready") return false;
  if (input.bucket !== input.bucketName) return false;
  return input.path === input.expectedPath;
}
