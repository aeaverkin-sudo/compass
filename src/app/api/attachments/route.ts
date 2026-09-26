import { NextResponse } from "next/server";
import { fileTypeFromBuffer } from "file-type/core";
import {
  insertAttachment,
  quotaAllows,
  readyByteTotal,
  removeStoredObject,
  requireOwnerId,
  safeOriginalName,
  storagePath,
} from "@/shared/services/attachment-api";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import {
  BUFFERED_BODY_LIMIT,
  CARD_ATTACHMENTS_BUCKET,
  byteLimitForMime,
  isSmallAttachmentKind,
  mimeAllowedForKind,
} from "@/shared/services/attachment-limits";
import { stripImageMetadata } from "@/shared/services/attachment-sanitize";

export const runtime = "nodejs";

function jsonFail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/**
 * Images, documents, and voice. The row is written only after the object lands.
 * Video does not come through here — it uses the signed upload URL.
 */
export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > BUFFERED_BODY_LIMIT) {
    return jsonFail(413, "File is too large for this upload");
  }

  const owner = await requireOwnerId();
  if (!owner.ok) return jsonFail(owner.status, owner.error);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonFail(400, "Expected a file upload");
  }

  const kindValue = form.get("kind");
  const file = form.get("file");
  if (typeof kindValue !== "string" || !(file instanceof File)) {
    return jsonFail(400, "Expected kind and file");
  }
  if (kindValue === "video") {
    return jsonFail(400, "Video uses the signed upload");
  }
  if (!isSmallAttachmentKind(kindValue)) {
    return jsonFail(400, "Unsupported kind");
  }
  if (file.size <= 0 || file.size > BUFFERED_BODY_LIMIT) {
    return jsonFail(413, "File is too large for this upload");
  }

  const raw = new Uint8Array(await file.arrayBuffer());
  const detected = await fileTypeFromBuffer(raw);
  if (!detected) return jsonFail(415, "Unrecognized file");
  if (!mimeAllowedForKind(kindValue, detected.mime)) {
    return jsonFail(415, "File type does not match");
  }

  const limit = byteLimitForMime(detected.mime);
  if (limit == null || raw.byteLength > limit) {
    return jsonFail(413, "File is over the limit for its type");
  }

  const bytes = detected.mime.startsWith("image/")
    ? stripImageMetadata(raw, detected.mime)
    : raw;

  let used = 0;
  try {
    used = await readyByteTotal(owner.id);
  } catch {
    return jsonFail(500, "Could not check storage quota");
  }
  if (!quotaAllows(used, bytes.byteLength)) {
    return jsonFail(413, "Account storage is full");
  }

  const attachmentId = crypto.randomUUID();
  const cardId = form.get("cardId");
  const path = storagePath(owner.id, typeof cardId === "string" ? cardId : null, attachmentId);

  const admin = createAdminSupabaseClient();
  const uploaded = await admin.storage.from(CARD_ATTACHMENTS_BUCKET).upload(path, bytes, {
    contentType: detected.mime,
    upsert: false,
  });
  if (uploaded.error) return jsonFail(500, "Could not store the file");

  try {
    await insertAttachment({
      id: attachmentId,
      ownerId: owner.id,
      path,
      mime: detected.mime,
      byteSize: bytes.byteLength,
      originalName: safeOriginalName(file.name),
      status: "ready",
    });
  } catch {
    await removeStoredObject(path);
    return jsonFail(500, "Could not save the file record");
  }

  return NextResponse.json({
    attachmentId,
    status: "ready" as const,
    byteSize: bytes.byteLength,
  });
}
