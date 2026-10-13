import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import {
  deleteAttachment,
  removeStoredObject,
  type AttachmentRow,
} from "@/shared/services/attachment-api";
import { CARD_ATTACHMENTS_BUCKET, looksLikePdf } from "@/shared/services/attachment-limits";

const PREFIX_TIMEOUT_MS = 10_000;

export type FinalizeResult =
  | { ok: true; byteSize: number }
  | { ok: false; status: number; error: string };

function storedSize(data: {
  size?: number;
  metadata?: { size?: number };
} | null): number | null {
  const size = data?.size ?? data?.metadata?.size;
  return typeof size === "number" && Number.isFinite(size) ? size : null;
}

class PrefixTimeout extends Error {}

/**
 * First bytes of a stored object, read whole from a ranged response.
 * A streamed read with cancel never settles under the Next server fetch.
 */
async function objectPrefix(path: string, byteCount: number): Promise<Uint8Array> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Storage is not configured");
  const encoded = path.split("/").map((part) => encodeURIComponent(part)).join("/");
  try {
    const response = await fetch(`${url}/storage/v1/object/${CARD_ATTACHMENTS_BUCKET}/${encoded}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        Range: `bytes=0-${byteCount - 1}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(PREFIX_TIMEOUT_MS),
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!response.ok) throw new Error(`Storage answered ${response.status}`);
    return bytes.subarray(0, byteCount);
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new PrefixTimeout();
    }
    throw error;
  }
}

/**
 * Ready only when the stored size matches the size declared at upload-url time.
 * A PDF must also start with a PDF header. A mismatch deletes the object and the row.
 * A timeout leaves the row pending, so a later call can still confirm it.
 */
export async function finalizePending(row: AttachmentRow, ownerId: string): Promise<FinalizeResult> {
  const admin = createAdminSupabaseClient();
  const info = await admin.storage.from(CARD_ATTACHMENTS_BUCKET).info(row.storage_path);
  const size = info.error ? null : storedSize(info.data);

  if (size == null || size !== row.byte_size) {
    await removeStoredObject(row.storage_path);
    await deleteAttachment(row.id, ownerId);
    return { ok: false, status: 409, error: "Upload did not finish" };
  }

  if (row.mime === "application/pdf") {
    let head: Uint8Array;
    try {
      head = await objectPrefix(row.storage_path, 1024);
    } catch (error) {
      if (error instanceof PrefixTimeout) {
        return { ok: false, status: 504, error: "Storage did not answer in time" };
      }
      console.error("[finalize] prefix read failed", error);
      return { ok: false, status: 502, error: "Could not read the stored file" };
    }
    if (!looksLikePdf(head)) {
      await removeStoredObject(row.storage_path);
      await deleteAttachment(row.id, ownerId);
      return { ok: false, status: 415, error: "File type does not match" };
    }
  }

  const { error } = await admin
    .from("attachments")
    .update({ status: "ready", byte_size: size })
    .eq("id", row.id)
    .eq("owner_id", ownerId)
    .eq("status", "pending");
  if (error) return { ok: false, status: 500, error: "Could not confirm the upload" };
  return { ok: true, byteSize: size };
}
