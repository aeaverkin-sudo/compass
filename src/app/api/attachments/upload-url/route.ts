import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import {
  deleteAttachment,
  insertAttachment,
  quotaAllows,
  readyByteTotal,
  requireOwnerId,
  safeOriginalName,
  storagePath,
} from "@/shared/services/attachment-api";
import {
  CARD_ATTACHMENTS_BUCKET,
  VIDEO_BYTE_LIMIT,
  isVideoMime,
} from "@/shared/services/attachment-limits";

export const runtime = "nodejs";

function jsonFail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/**
 * Video only. Creates a pending row and a path-bound upload token.
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

  const { mime, byteSize, originalName, cardId } = body as {
    mime?: unknown;
    byteSize?: unknown;
    originalName?: unknown;
    cardId?: unknown;
  };

  if (typeof mime !== "string" || !isVideoMime(mime)) {
    return jsonFail(415, "Unsupported video type");
  }
  if (typeof byteSize !== "number" || !Number.isInteger(byteSize) || byteSize <= 0) {
    return jsonFail(400, "Expected a file size");
  }
  if (byteSize > VIDEO_BYTE_LIMIT) {
    return jsonFail(413, "Video is over 50 MB");
  }

  let used = 0;
  try {
    used = await readyByteTotal(owner.id);
  } catch {
    return jsonFail(500, "Could not check storage quota");
  }
  if (!quotaAllows(used, byteSize)) {
    return jsonFail(413, "Account storage is full");
  }

  const attachmentId = crypto.randomUUID();
  const path = storagePath(
    owner.id,
    typeof cardId === "string" ? cardId : null,
    attachmentId,
  );

  try {
    await insertAttachment({
      id: attachmentId,
      ownerId: owner.id,
      path,
      mime,
      byteSize,
      originalName: safeOriginalName(originalName),
      status: "pending",
    });
  } catch {
    return jsonFail(500, "Could not save the file record");
  }

  const admin = createAdminSupabaseClient();
  const signed = await admin.storage.from(CARD_ATTACHMENTS_BUCKET).createSignedUploadUrl(path, {
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
    status: "pending" as const,
  });
}
