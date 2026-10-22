import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { deleteAttachment, removeStoredObject } from "@/shared/services/attachment-api";
import { CARD_ATTACHMENTS_BUCKET, NOTE_FILE_GRACE_MS, TRANSFER_ASSETS_BUCKET } from "@/shared/services/attachment-limits";
import { deleteOwnAccount } from "@/shared/services/account-delete";
import { keepSavedCardSnapshots } from "@/shared/services/connection-snapshot";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Tapped in, never started the trial. */
export const ABANDONED_ANON_MS = 48 * HOUR_MS;
/** Undelivered handoff kept past this is removed with its files. Matches the note TTL. */
export const STALE_TRANSFER_MS = 7 * DAY_MS;
/** A just-uploaded file is not an orphan yet. */
const ORPHAN_MIN_AGE_MS = 24 * HOUR_MS;

const USER_BATCH = 20;
const FILE_BATCH = 80;
const SWEEP_PREFIXES = 15;

type AttachmentRow = {
  id: string;
  owner_id: string;
  bucket: string;
  storage_path: string;
  delete_after?: string | null;
};

export type PurgeReport = {
  purgedTrials: number;
  purgedAnon: number;
  expiredCodes: number;
  staleTransfers: number;
  orphanFiles: number;
  scrubbedGuests: number;
};

async function idsOf(table: "cards" | "items" | "transfer_items" | "events", column: string, ids: string[]) {
  if (ids.length === 0) return [];
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from(table).select(column).in(column, ids);
  if (error) {
    if (table === "events" && /logo_attachment_id|does not exist/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).flatMap((row) => {
    const value = (row as unknown as Record<string, unknown>)[column];
    return typeof value === "string" ? [value] : [];
  });
}

async function referenced(ids: string[]) {
  const lists = await Promise.all([
    idsOf("cards", "photo_attachment_id", ids),
    idsOf("items", "attachment_id", ids),
    idsOf("transfer_items", "attachment_id", ids),
    idsOf("events", "logo_attachment_id", ids),
  ]);
  return new Set(lists.flat());
}

async function dropAttachment(row: AttachmentRow) {
  if (row.bucket === CARD_ATTACHMENTS_BUCKET || row.bucket === TRANSFER_ASSETS_BUCKET) {
    await removeStoredObject(row.storage_path, row.bucket);
  }
  await deleteAttachment(row.id, row.owner_id);
}

const KEPT_MARKS = /checked_in_at|paid_status|paid_source/i;

/**
 * The organiser keeps In and Paid after a pass account is gone: the list guest takes them
 * from the registration before it is deleted. Without the columns nothing is copied.
 */
async function keepGuestMarks(userId: string) {
  const admin = createAdminSupabaseClient();
  const regs = await admin
    .from("event_registrations")
    .select("id, checked_in_at, paid_status, paid_source")
    .eq("user_id", userId);
  if (regs.error) {
    if (KEPT_MARKS.test(regs.error.message)) return;
    throw new Error(regs.error.message);
  }
  type Marks = { id: string; checked_in_at: string | null; paid_status: string | null; paid_source: string | null };
  for (const reg of (regs.data ?? []) as Marks[]) {
    if (!reg.checked_in_at && !reg.paid_status) continue;
    const copied = await admin
      .from("event_guests")
      .update({ checked_in_at: reg.checked_in_at, paid_status: reg.paid_status, paid_source: reg.paid_source })
      .eq("registration_id", reg.id);
    if (copied.error) {
      if (KEPT_MARKS.test(copied.error.message)) return;
      throw new Error(copied.error.message);
    }
  }
}

const GUEST_NAME = "Guest";

/**
 * 90 days after an event its list guests lose their name, contact and link.
 * The rows stay, so the organiser's counts stay.
 */
async function scrubOldGuests() {
  const admin = createAdminSupabaseClient();
  const due = await admin
    .from("events")
    .select("id")
    .lte("guests_purge_at", new Date().toISOString())
    .is("guests_purged_at", null)
    .limit(USER_BATCH);
  if (due.error) {
    if (/guests_purge_at|guests_purged_at/i.test(due.error.message)) return 0;
    throw new Error(due.error.message);
  }
  let count = 0;
  for (const event of (due.data ?? []) as { id: string }[]) {
    const scrubbed = await admin
      .from("event_guests")
      .update({ name: GUEST_NAME, email: null, phone: null, token: null })
      .eq("event_id", event.id)
      .select("id");
    if (scrubbed.error) {
      console.error("[purge] guests", event.id, scrubbed.error.message);
      continue;
    }
    count += (scrubbed.data ?? []).length;
    const stamped = await admin.from("events").update({ guests_purged_at: new Date().toISOString() }).eq("id", event.id);
    if (stamped.error) console.error("[purge] guests stamp", event.id, stamped.error.message);
  }
  return count;
}

async function purgeUsers(filter: "trial" | "anon") {
  const admin = createAdminSupabaseClient();
  const now = Date.now();
  let query = admin.from("profiles").select("id").is("registered_at", null).limit(USER_BATCH);
  if (filter === "trial") {
    query = query.lte("purge_at", new Date(now).toISOString()).order("purge_at");
  } else {
    query = query
      .is("draft_expires_at", null)
      .lt("created_at", new Date(now - ABANDONED_ANON_MS).toISOString())
      .order("created_at");
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  let count = 0;
  for (const row of data ?? []) {
    const id = row.id as string;
    try {
      if (filter === "trial") await keepGuestMarks(id);
      await keepSavedCardSnapshots(id);
      await deleteOwnAccount(id);
      count += 1;
    } catch (reason) {
      console.error("[purge] account", id, reason);
    }
  }
  return count;
}

async function retireTransfer(id: string) {
  const admin = createAdminSupabaseClient();
  const files = await admin.from("transfer_items").select("attachment_id").eq("transfer_id", id);
  if (files.error) throw new Error(files.error.message);
  const attachmentIds = (files.data ?? []).flatMap((row) =>
    typeof row.attachment_id === "string" ? [row.attachment_id] : [],
  );
  const { error: deleteError } = await admin.from("card_transfers").delete().eq("id", id);
  if (deleteError) throw new Error(deleteError.message);
  if (attachmentIds.length === 0) return;
  const { data: rows, error: readError } = await admin
    .from("attachments")
    .select("id, owner_id, bucket, storage_path")
    .in("id", attachmentIds);
  if (readError) throw new Error(readError.message);
  for (const row of (rows ?? []) as AttachmentRow[]) {
    try {
      await dropAttachment(row);
    } catch (reason) {
      console.error("[purge] transfer file", row.id, reason);
    }
  }
}

async function transferIds(
  status: "pending" | "expired" | "consumed",
  column: "expires_at" | "consumed_at",
  cutoff: string,
) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("card_transfers")
    .select("id")
    .eq("status", status)
    .lt(column, cutoff)
    .limit(FILE_BATCH);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.id as string);
}

async function abandonedTransferIds(now: string) {
  const admin = createAdminSupabaseClient();
  const createdCutoff = new Date(Date.now() - STALE_TRANSFER_MS).toISOString();
  const { data, error } = await admin
    .from("card_transfers")
    .select("id")
    .in("status", ["pending", "expired"])
    .or(`expires_at.lt."${now}",created_at.lt."${createdCutoff}"`)
    .limit(FILE_BATCH);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.id as string);
}

/** Abandoned notes past their TTL, delivered notes the handoff could not retire, and files past the grace. */
async function purgeStaleTransfers() {
  const now = new Date().toISOString();
  const graceCutoff = new Date(Date.now() - NOTE_FILE_GRACE_MS).toISOString();
  const abandoned = await abandonedTransferIds(now);
  const consumed = await transferIds("consumed", "consumed_at", graceCutoff);
  let count = 0;
  for (const id of [...abandoned, ...consumed]) {
    await retireTransfer(id);
    count += 1;
  }
  count += await purgeScheduledTransferFiles();
  return count;
}

async function purgeScheduledTransferFiles() {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("attachments")
    .select("id, owner_id, bucket, storage_path, delete_after")
    .eq("bucket", TRANSFER_ASSETS_BUCKET)
    .lte("delete_after", new Date().toISOString())
    .limit(FILE_BATCH);
  if (error) {
    if (/delete_after/i.test(error.message)) return 0;
    throw new Error(error.message);
  }
  let count = 0;
  for (const row of (data ?? []) as AttachmentRow[]) {
    try {
      await dropAttachment(row);
      count += 1;
    } catch (reason) {
      console.error("[purge] delivered file", row.id, reason);
    }
  }
  return count;
}

async function purgeOrphanRows() {
  const admin = createAdminSupabaseClient();
  const cutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS).toISOString();
  const listed = await admin
    .from("attachments")
    .select("id, owner_id, bucket, storage_path, delete_after")
    .lt("created_at", cutoff)
    .order("created_at")
    .limit(FILE_BATCH);
  let data = listed.data as AttachmentRow[] | null;
  let error = listed.error;
  if (error && /delete_after/i.test(error.message)) {
    const fallback = await admin
      .from("attachments")
      .select("id, owner_id, bucket, storage_path")
      .lt("created_at", cutoff)
      .order("created_at")
      .limit(FILE_BATCH);
    data = fallback.data as AttachmentRow[] | null;
    error = fallback.error;
  }
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as AttachmentRow[]).filter((row) => {
    if (!row.delete_after) return true;
    return new Date(row.delete_after).getTime() <= Date.now();
  });
  const used = await referenced(rows.map((row) => row.id));
  let count = 0;
  for (const row of rows) {
    if (used.has(row.id)) continue;
    try {
      await dropAttachment(row);
      count += 1;
    } catch (reason) {
      console.error("[purge] orphan row", row.id, reason);
    }
  }
  return count;
}

type StorageEntry = {
  name: string;
  id?: string | null;
  created_at?: string;
  metadata?: Record<string, unknown> | null;
};

function isFolder(entry: StorageEntry) {
  return entry.id == null && entry.metadata == null;
}

async function listPrefix(bucket: string, prefix: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 100 });
  if (error) throw new Error(error.message);
  return (data ?? []) as StorageEntry[];
}

async function dropLooseFile(bucket: string, path: string, createdAt: string | undefined, cutoff: number) {
  const created = createdAt ? new Date(createdAt).getTime() : 0;
  if (!created || created > cutoff) return false;
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("attachments")
    .select("id")
    .eq("bucket", bucket)
    .eq("storage_path", path)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return false;
  await removeStoredObject(path, bucket);
  return true;
}

async function sweepBucket(bucket: string) {
  const top = await listPrefix(bucket, "");
  const prefixes = top.filter(isFolder).slice(0, SWEEP_PREFIXES);
  let count = 0;
  const cutoff = Date.now() - ORPHAN_MIN_AGE_MS;
  for (const folder of prefixes) {
    const nested = await listPrefix(bucket, folder.name);
    for (const entry of nested) {
      if (count >= FILE_BATCH) return count;
      if (isFolder(entry)) {
        const deeper = await listPrefix(bucket, `${folder.name}/${entry.name}`);
        for (const file of deeper) {
          if (count >= FILE_BATCH) return count;
          if (isFolder(file)) continue;
          if (await dropLooseFile(bucket, `${folder.name}/${entry.name}/${file.name}`, file.created_at, cutoff)) {
            count += 1;
          }
        }
        continue;
      }
      if (await dropLooseFile(bucket, `${folder.name}/${entry.name}`, entry.created_at, cutoff)) count += 1;
    }
  }
  return count;
}

async function purgeExpiredCodes() {
  const admin = createAdminSupabaseClient();
  const { error, count } = await admin
    .from("pending_email_signups")
    .delete({ count: "exact" })
    .lt("expires_at", new Date().toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Expired trials, abandoned anonymous profiles, stale handoffs, and files nothing points at. */
export async function runPurge(): Promise<PurgeReport> {
  const purgedTrials = await purgeUsers("trial");
  const purgedAnon = await purgeUsers("anon");
  const expiredCodes = await purgeExpiredCodes();
  const staleTransfers = await purgeStaleTransfers();
  const orphanRows = await purgeOrphanRows();
  const looseCard = await sweepBucket(CARD_ATTACHMENTS_BUCKET);
  const looseTransfer = await sweepBucket(TRANSFER_ASSETS_BUCKET);
  const scrubbedGuests = await scrubOldGuests();
  return {
    purgedTrials,
    purgedAnon,
    expiredCodes,
    staleTransfers,
    orphanFiles: orphanRows + looseCard + looseTransfer,
    scrubbedGuests,
  };
}
