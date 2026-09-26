import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import {
  downloadAttachmentBytes,
  isUuid,
  loadAttachment,
  safeOriginalName,
  type AttachmentRow,
} from "@/shared/services/attachment-api";
import { CARD_ATTACHMENTS_BUCKET, TRANSFER_ASSETS_BUCKET, isServableMime } from "@/shared/services/attachment-limits";
import { attachmentIsPublic } from "@/shared/services/public-card";

export const runtime = "nodejs";

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

function downloadName(originalName: string | null, id: string): string {
  const cleaned = (safeOriginalName(originalName) ?? id).replace(/["\\;]/g, "");
  return cleaned || id;
}

async function viewerId(): Promise<string | null> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

function fileResponse(row: AttachmentRow, bytes: Uint8Array) {
  const filename = downloadName(row.original_name, row.id);
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  const body = Uint8Array.from(bytes);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": row.mime || "application/octet-stream",
      "Content-Disposition": `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
      "Content-Length": String(body.byteLength),
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Ready files only. Bytes are read from Storage and returned here,
 * so the browser opens the file on this site instead of a storage host.
 * Strangers get a file only when it sits on a public ready card.
 * Everything else is 404, so a private id does not leak.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ attachmentId: string }> },
) {
  const { attachmentId } = await context.params;
  if (!isUuid(attachmentId)) return notFound();

  let row;
  try {
    row = await loadAttachment(attachmentId);
  } catch {
    return NextResponse.json({ error: "Could not read the file" }, { status: 500 });
  }

  if (!row || row.status !== "ready") return notFound();

  const viewer = await viewerId();
  const owner = viewer === row.owner_id;

  if (row.bucket === TRANSFER_ASSETS_BUCKET) {
    if (!owner) return notFound();
  } else if (row.bucket !== CARD_ATTACHMENTS_BUCKET) {
    return notFound();
  } else if (!owner) {
    if (!isServableMime(row.mime)) return notFound();
    try {
      if (!(await attachmentIsPublic(attachmentId))) return notFound();
    } catch {
      return NextResponse.json({ error: "Could not read the file" }, { status: 500 });
    }
  }

  const bytes = await downloadAttachmentBytes(row);
  if (!bytes) return NextResponse.json({ error: "Could not open the file" }, { status: 500 });
  return fileResponse(row, bytes);
}
