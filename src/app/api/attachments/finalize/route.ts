import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import {
  deleteAttachment,
  isUuid,
  loadAttachment,
  removeStoredObject,
  requireOwnerId,
} from "@/shared/services/attachment-api";
import { CARD_ATTACHMENTS_BUCKET } from "@/shared/services/attachment-limits";

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

/**
 * Confirms a video object. Ready only when the stored size matches the
 * size declared at upload-url time. A mismatch deletes the object and the row.
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
