import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { CARD_ATTACHMENTS_BUCKET } from "@/shared/services/attachment-limits";

const BATCH = 100;

type StorageEntry = {
  name: string;
  id?: string | null;
  metadata?: Record<string, unknown> | null;
};

function isFolder(entry: StorageEntry) {
  return entry.id == null && entry.metadata == null;
}

async function removePaths(bucket: string, paths: string[]) {
  const admin = createAdminSupabaseClient();
  for (let index = 0; index < paths.length; index += BATCH) {
    const slice = paths.slice(index, index + BATCH);
    if (slice.length === 0) continue;
    const { error } = await admin.storage.from(bucket).remove(slice);
    if (error) throw new Error(error.message);
  }
}

async function listPrefix(bucket: string, prefix: string) {
  const admin = createAdminSupabaseClient();
  const entries: StorageEntry[] = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 100, offset });
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    entries.push(...(data as StorageEntry[]));
    if (data.length < 100) break;
  }
  return entries;
}

/** Objects recorded for this owner, then anything left under their card-attachments prefix. */
async function removeOwnerFiles(userId: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("attachments").select("bucket, storage_path").eq("owner_id", userId);
  if (error) throw new Error(error.message);

  const byBucket = new Map<string, string[]>();
  for (const row of data ?? []) {
    if (typeof row.bucket !== "string" || typeof row.storage_path !== "string" || !row.storage_path) continue;
    const paths = byBucket.get(row.bucket) ?? [];
    paths.push(row.storage_path);
    byBucket.set(row.bucket, paths);
  }
  for (const [bucket, paths] of byBucket) {
    await removePaths(bucket, paths);
  }

  const top = await listPrefix(CARD_ATTACHMENTS_BUCKET, userId);
  const loose = top.filter((entry) => !isFolder(entry)).map((entry) => `${userId}/${entry.name}`);
  await removePaths(CARD_ATTACHMENTS_BUCKET, loose);
  for (const folder of top.filter(isFolder)) {
    const prefix = `${userId}/${folder.name}`;
    const nested = await listPrefix(CARD_ATTACHMENTS_BUCKET, prefix);
    const files = nested.filter((entry) => !isFolder(entry)).map((entry) => `${prefix}/${entry.name}`);
    await removePaths(CARD_ATTACHMENTS_BUCKET, files);
  }
}

/** Deletes this user's auth row. Profiles, cards, and items follow by ON DELETE CASCADE. */
export async function deleteOwnAccount(userId: string) {
  await removeOwnerFiles(userId);
  const admin = createAdminSupabaseClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
}
