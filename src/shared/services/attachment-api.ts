import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import {
  ACCOUNT_BYTE_LIMIT,
  CARD_ATTACHMENTS_BUCKET,
} from "@/shared/services/attachment-limits";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AttachmentStatus = "pending" | "ready";

export type AttachmentRow = {
  id: string;
  owner_id: string;
  bucket: string;
  storage_path: string;
  mime: string;
  byte_size: number;
  original_name: string | null;
  status: AttachmentStatus;
};

export type ApiFail = { ok: false; status: number; error: string };

export function fail(status: number, error: string): ApiFail {
  return { ok: false, status, error };
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function safeOriginalName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const base = name.split(/[/\\]/).pop()?.replace(/[\u0000-\u001f]/g, "").trim() ?? "";
  if (!base) return null;
  return base.slice(0, 180);
}

export function storagePath(ownerId: string, cardId: string | null, attachmentId: string): string {
  const folder = cardId && isUuid(cardId) ? cardId : "profile";
  return `${ownerId}/${folder}/${attachmentId}`;
}

export async function requireOwnerId(): Promise<{ ok: true; id: string } | ApiFail> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return fail(401, "Unauthorized");
  return { ok: true, id: data.user.id };
}

export async function readyByteTotal(ownerId: string): Promise<number> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("attachments")
    .select("byte_size")
    .eq("owner_id", ownerId)
    .eq("status", "ready");
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((sum, row) => sum + Number(row.byte_size ?? 0), 0);
}

export function quotaAllows(used: number, incoming: number): boolean {
  return used + incoming <= ACCOUNT_BYTE_LIMIT;
}

export async function insertAttachment(row: {
  id: string;
  ownerId: string;
  path: string;
  mime: string;
  byteSize: number;
  originalName: string | null;
  status: AttachmentStatus;
}): Promise<void> {
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("attachments").insert({
    id: row.id,
    owner_id: row.ownerId,
    bucket: CARD_ATTACHMENTS_BUCKET,
    storage_path: row.path,
    mime: row.mime,
    byte_size: row.byteSize,
    original_name: row.originalName,
    status: row.status,
  });
  if (error) throw new Error(error.message);
}

export async function deleteAttachment(id: string, ownerId: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  await admin.from("attachments").delete().eq("id", id).eq("owner_id", ownerId);
}

export async function removeStoredObject(path: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  await admin.storage.from(CARD_ATTACHMENTS_BUCKET).remove([path]);
}

export async function loadAttachment(id: string): Promise<AttachmentRow | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("attachments")
    .select("id, owner_id, bucket, storage_path, mime, byte_size, original_name, status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return data as AttachmentRow;
}
