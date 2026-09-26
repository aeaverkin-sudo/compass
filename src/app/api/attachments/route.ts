import { NextResponse } from "next/server";
import { fileTypeFromBuffer } from "file-type/core";
import {
  insertAttachment,
  isUuid,
  quotaAllows,
  readyByteTotal,
  removeStoredObject,
  requireOwnerId,
  safeOriginalName,
  storagePath,
} from "@/shared/services/attachment-api";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import {
  AUDIO_BYTE_LIMIT,
  BUFFERED_BODY_LIMIT,
  CARD_ATTACHMENTS_BUCKET,
  TRANSFER_ASSETS_BUCKET,
  byteLimitForMime,
  isSmallAttachmentKind,
  isTransferNoteKind,
  mimeAllowedForKind,
  transferMimeAllowed,
} from "@/shared/services/attachment-limits";
import { stripImageMetadata } from "@/shared/services/attachment-sanitize";

export const runtime = "nodejs";

function jsonFail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/** Selfie and voice for a pending transfer. The object goes to transfer-assets, not the card bucket. */
async function storeTransferNote(ownerId: string, kindValue: string, transferId: string, file: File) {
  if (!isUuid(transferId) || !isTransferNoteKind(kindValue)) {
    return jsonFail(400, "Expected a selfie or voice for a transfer");
  }
  if (file.size <= 0 || file.size > BUFFERED_BODY_LIMIT) {
    return jsonFail(413, "File is too large for this upload");
  }

  const admin = createAdminSupabaseClient();
  const transfer = await admin
    .from("card_transfers")
    .select("id, card_id, status, expires_at")
    .eq("id", transferId)
    .maybeSingle();
  if (transfer.error) return jsonFail(500, "Could not read the note");
  const row = transfer.data;
  if (!row || row.status !== "pending" || new Date(row.expires_at).getTime() <= Date.now()) {
    return jsonFail(404, "Note is not waiting");
  }
  const card = await admin.from("cards").select("owner_id").eq("id", row.card_id).maybeSingle();
  if (card.error) return jsonFail(500, "Could not read the note");
  if (card.data?.owner_id !== ownerId) return jsonFail(404, "Note is not waiting");

  const raw = new Uint8Array(await file.arrayBuffer());
  const detected = await fileTypeFromBuffer(raw);
  if (!detected || !transferMimeAllowed(kindValue, detected.mime)) {
    return jsonFail(415, "File type does not match");
  }

  const limit = kindValue === "voice" ? AUDIO_BYTE_LIMIT : byteLimitForMime(detected.mime);
  if (limit == null || raw.byteLength > limit) {
    return jsonFail(413, "File is over the limit for its type");
  }

  const bytes = detected.mime.startsWith("image/") ? stripImageMetadata(raw, detected.mime) : raw;

  let used = 0;
  try {
    used = await readyByteTotal(ownerId);
  } catch {
    return jsonFail(500, "Could not check storage quota");
  }
  if (!quotaAllows(used, bytes.byteLength)) {
    return jsonFail(413, "Account storage is full");
  }

  const attachmentId = crypto.randomUUID();
  const path = `${transferId}/${attachmentId}`;
  const uploaded = await admin.storage.from(TRANSFER_ASSETS_BUCKET).upload(path, bytes, {
    contentType: detected.mime.split(";")[0],
    upsert: false,
  });
  if (uploaded.error) return jsonFail(500, "Could not store the file");

  try {
    await insertAttachment({
      id: attachmentId,
      ownerId,
      path,
      mime: detected.mime.split(";")[0] ?? detected.mime,
      byteSize: bytes.byteLength,
      originalName: safeOriginalName(file.name),
      status: "ready",
      bucket: TRANSFER_ASSETS_BUCKET,
    });
  } catch {
    await removeStoredObject(path, TRANSFER_ASSETS_BUCKET);
    return jsonFail(500, "Could not save the file record");
  }

  return NextResponse.json({
    attachmentId,
    status: "ready" as const,
    byteSize: bytes.byteLength,
  });
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
  const transferValue = form.get("transferId");
  if (typeof kindValue !== "string" || !(file instanceof File)) {
    return jsonFail(400, "Expected kind and file");
  }
  if (typeof transferValue === "string" && transferValue.length > 0) {
    return storeTransferNote(owner.id, kindValue, transferValue, file);
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
