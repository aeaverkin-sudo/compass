import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { deleteAttachment, removeStoredObject } from "@/shared/services/attachment-api";
import { CARD_ATTACHMENTS_BUCKET, TRANSFER_ASSETS_BUCKET } from "@/shared/services/attachment-limits";
import { deleteOwnAccount } from "@/shared/services/account-delete";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Tapped in, never started the trial. */
export const ABANDONED_ANON_MS = 48 * HOUR_MS;
/** Undelivered handoff kept past this is removed with its files. */
export const STALE_TRANSFER_MS = 14 * DAY_MS;
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
};

export type PurgeReport = {
  purgedTrials: number;
  purgedAnon: number;
  expiredCodes: number;
  staleTransfers: number;
  orphanFiles: number;
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
      await deleteOwnAccount(id);
      count += 1;
    } catch (reason) {
      console.error("[purge] account", id, reason);
    }
  }
  return count;
}

async function purgeStaleTransfers() {
  const admin = createAdminSupabaseClient();
  const cutoff = new Date(Date.now() - STALE_TRANSFER_MS).toISOString();
  const { data, error } = await admin
    .from("card_transfers")
    .select("id")
    .in("status", ["pending", "expired"])
    .lt("created_at", cutoff)
    .limit(FILE_BATCH);
  if (error) throw new Error(error.message);
  let count = 0;
  for (const transfer of data ?? []) {
    const id = transfer.id as string;
    const files = await admin.from("transfer_items").select("attachment_id").eq("transfer_id", id);
    if (files.error) throw new Error(files.error.message);
    const attachmentIds = (files.data ?? []).flatMap((row) =>
      typeof row.attachment_id === "string" ? [row.attachment_id] : [],
    );
    const { error: deleteError } = await admin.from("card_transfers").delete().eq("id", id);
    if (deleteError) throw new Error(deleteError.message);
    if (attachmentIds.length > 0) {
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
    count += 1;
  }
  return count;
}

async function purgeOrphanRows() {
  const admin = createAdminSupabaseClient();
  const cutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS).toISOString();
  const { data, error } = await admin
    .from("attachments")
    .select("id, owner_id, bucket, storage_path")
    .lt("created_at", cutoff)
    .order("created_at")
    .limit(FILE_BATCH);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as AttachmentRow[];
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
  return {
    purgedTrials,
    purgedAnon,
    expiredCodes,
    staleTransfers,
    orphanFiles: orphanRows + looseCard + looseTransfer,
  };
}
