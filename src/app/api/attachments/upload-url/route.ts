import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { ownsExternalContact } from "@/features/contact-collect/store";
import { contactFilePath } from "@/features/contact-collect/contact-files";
import {
  accountBytesLimit,
  deleteAttachment,
  insertAttachment,
  isUuid,
  quotaAllows,
  readyByteTotal,
  requireOwnerId,
  safeOriginalName,
  storagePath,
} from "@/shared/services/attachment-api";
import {
  CARD_ATTACHMENTS_BUCKET,
  CONTACT_FILES_BUCKET,
  PDF_BYTE_LIMIT,
  VIDEO_BYTE_LIMIT,
  isVideoMime,
} from "@/shared/services/attachment-limits";

export const runtime = "nodejs";

function jsonFail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/**
 * Video and PDF. Creates a pending row and a path-bound upload token.
 * The browser uploads straight to Storage, then calls finalize.
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
  if (!body || typeof body !== "object") return jsonFail(400, "Expected JSON");

  const { mime, byteSize, originalName, cardId, contactId } = body as {
    mime?: unknown;
    byteSize?: unknown;
    originalName?: unknown;
    cardId?: unknown;
    contactId?: unknown;
  };

  if (typeof mime !== "string" || (mime !== "application/pdf" && !isVideoMime(mime))) {
    return jsonFail(415, "Unsupported file type");
  }
  if (typeof byteSize !== "number" || !Number.isInteger(byteSize) || byteSize <= 0) {
    return jsonFail(400, "Expected a file size");
  }
  const ceiling = mime === "application/pdf" ? PDF_BYTE_LIMIT : VIDEO_BYTE_LIMIT;
  if (byteSize > ceiling) {
    return jsonFail(413, mime === "application/pdf" ? "PDF is over 50 MB" : "Video is over 50 MB");
  }

  let used = 0;
  try {
    used = await readyByteTotal(owner.id);
  } catch {
    return jsonFail(500, "Could not check storage quota");
  }
  const bytesLimit = await accountBytesLimit(owner.id);
  if (!quotaAllows(used, byteSize, bytesLimit)) {
    return jsonFail(413, "Account storage is full");
  }

  const attachmentId = crypto.randomUUID();
  const contact = typeof contactId === "string" && contactId.length > 0 ? contactId : null;
  if (contact && typeof cardId === "string" && cardId.length > 0) {
    return jsonFail(400, "Expected one destination");
  }
  let bucket: string = CARD_ATTACHMENTS_BUCKET;
  let path = storagePath(owner.id, typeof cardId === "string" ? cardId : null, attachmentId);
  if (contact) {
    if (!isUuid(contact)) return jsonFail(404, "Contact not found.");
    const owned = await ownsExternalContact(owner.id, contact);
    if (owned === "unavailable") return jsonFail(503, "Contacts are not ready.");
    if (owned === "failed") return jsonFail(500, "Could not store the file");
    if (owned !== "yes") return jsonFail(404, "Contact not found.");
    bucket = CONTACT_FILES_BUCKET;
    path = contactFilePath(owner.id, contact, attachmentId);
  }

  try {
    await insertAttachment({
      id: attachmentId,
      ownerId: owner.id,
      path,
      mime,
      byteSize,
      originalName: safeOriginalName(originalName),
      status: "pending",
      bucket,
    });
  } catch {
    return jsonFail(500, "Could not save the file record");
  }

  const admin = createAdminSupabaseClient();
  const signed = await admin.storage.from(bucket).createSignedUploadUrl(path, {
    upsert: false,
  });
  if (signed.error || !signed.data) {
    await deleteAttachment(attachmentId, owner.id);
    return jsonFail(500, "Could not start the upload");
  }

  return NextResponse.json({
    attachmentId,
    path: signed.data.path,
    token: signed.data.token,
    bucket,
    status: "pending" as const,
  });
}
