import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { isUuid, loadAttachment, requireOwnerId } from "@/shared/services/attachment-api";
import {
  CARD_ATTACHMENTS_BUCKET,
  SIGNED_READ_SECONDS,
} from "@/shared/services/attachment-limits";

export const runtime = "nodejs";

/**
 * Owner-only read. Redirects to a short-lived signed URL.
 * Pending uploads are not served. Public responses (Content-Disposition)
 * belong to phase 4.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ attachmentId: string }> },
) {
  const { attachmentId } = await context.params;
  if (!isUuid(attachmentId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const owner = await requireOwnerId();
  if (!owner.ok) {
    return NextResponse.json({ error: owner.error }, { status: owner.status });
  }

  let row;
  try {
    row = await loadAttachment(attachmentId);
  } catch {
    return NextResponse.json({ error: "Could not read the file" }, { status: 500 });
  }

  if (!row || row.bucket !== CARD_ATTACHMENTS_BUCKET) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.owner_id !== owner.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (row.status !== "ready") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const admin = createAdminSupabaseClient();
  const signed = await admin.storage
    .from(row.bucket)
    .createSignedUrl(row.storage_path, SIGNED_READ_SECONDS);
  if (signed.error || !signed.data?.signedUrl) {
    return NextResponse.json({ error: "Could not open the file" }, { status: 500 });
  }

  return NextResponse.redirect(signed.data.signedUrl, 302);
}
