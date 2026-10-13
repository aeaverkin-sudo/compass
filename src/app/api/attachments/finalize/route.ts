import { NextResponse } from "next/server";
import { isUuid, loadAttachment, requireOwnerId } from "@/shared/services/attachment-api";
import { finalizePending } from "@/shared/services/attachment-finalize";
import { CARD_ATTACHMENTS_BUCKET } from "@/shared/services/attachment-limits";

export const runtime = "nodejs";

function jsonFail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/**
 * Confirms a video or PDF object. See `finalizePending` for the checks.
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

  const result = await finalizePending(row, owner.id);
  if (!result.ok) return jsonFail(result.status, result.error);

  return NextResponse.json({
    attachmentId: row.id,
    status: "ready" as const,
    byteSize: result.byteSize,
  });
}
