import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import {
  deleteAttachment,
  isUuid,
  loadAttachment,
  removeStoredObject,
  requireOwnerId,
} from "@/shared/services/attachment-api";
import { CARD_ATTACHMENTS_BUCKET, looksLikePdf } from "@/shared/services/attachment-limits";

export const runtime = "nodejs";

function jsonFail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

function storedSize(data: {
  size?: number;
  metadata?: { size?: number };
} | null): number | null {
  const size = data?.size ?? data?.metadata?.size;
  return typeof size === "number" && Number.isFinite(size) ? size : null;
}

/** First bytes of a stored object. The rest of a large PDF stays in the bucket. */
async function objectPrefix(path: string, byteCount: number): Promise<Uint8Array | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const encoded = path.split("/").map((part) => encodeURIComponent(part)).join("/");
  const response = await fetch(`${url}/storage/v1/object/${CARD_ATTACHMENTS_BUCKET}/${encoded}`, {
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      Range: `bytes=0-${byteCount - 1}`,
    },
  });
  if (!response.ok && response.status !== 206) {
    await response.body?.cancel();
    return null;
  }
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let got = 0;
  while (got < byteCount) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    got += value.byteLength;
  }
  await reader.cancel();
  const merged = new Uint8Array(Math.min(got, byteCount));
  let offset = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk.byteLength, merged.length - offset);
    if (take <= 0) break;
    merged.set(chunk.subarray(0, take), offset);
    offset += take;
  }
  return merged.subarray(0, offset);
}

/**
 * Confirms a video or PDF object. Ready only when the stored size matches the
 * size declared at upload-url time. A PDF must also start with a PDF header.
 * A mismatch deletes the object and the row.
 * A pending row that never reaches this route stays out of the 500 MB quota.
 */
export async function POST(request: Request) {
  const owner = await requireOwnerId();
  if (!owner.ok) return jsonFail(owner.status, owner.error);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonFail(400, "Expected JSON");
  }
  const attachmentId =
    body && typeof body === "object" && "attachmentId" in body
      ? (body as { attachmentId?: unknown }).attachmentId
      : null;
  if (typeof attachmentId !== "string" || !isUuid(attachmentId)) {
    return jsonFail(400, "Expected an attachment id");
  }

  let row;
  try {
    row = await loadAttachment(attachmentId);
  } catch {
    return jsonFail(500, "Could not read the file record");
  }
  if (!row || row.owner_id !== owner.id) return jsonFail(404, "Not found");
  if (row.bucket !== CARD_ATTACHMENTS_BUCKET) return jsonFail(404, "Not found");
  if (row.status === "ready") {
    return NextResponse.json({
      attachmentId: row.id,
      status: "ready" as const,
      byteSize: row.byte_size,
    });
  }

  const admin = createAdminSupabaseClient();
  const info = await admin.storage.from(CARD_ATTACHMENTS_BUCKET).info(row.storage_path);
  const size = info.error ? null : storedSize(info.data);

  if (size == null || size !== row.byte_size) {
    await removeStoredObject(row.storage_path);
    await deleteAttachment(row.id, owner.id);
    return jsonFail(409, "Upload did not finish");
  }

  if (row.mime === "application/pdf") {
    const head = await objectPrefix(row.storage_path, 1024);
    if (!head || !looksLikePdf(head)) {
      await removeStoredObject(row.storage_path);
      await deleteAttachment(row.id, owner.id);
      return jsonFail(415, "File type does not match");
    }
  }

  const { error } = await admin
    .from("attachments")
    .update({ status: "ready", byte_size: size })
    .eq("id", row.id)
    .eq("owner_id", owner.id)
    .eq("status", "pending");
  if (error) return jsonFail(500, "Could not confirm the upload");

  return NextResponse.json({
    attachmentId: row.id,
    status: "ready" as const,
    byteSize: size,
  });
}
