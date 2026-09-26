import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { isUuid, loadAttachment, safeOriginalName } from "@/shared/services/attachment-api";
import {
  CARD_ATTACHMENTS_BUCKET,
  SIGNED_READ_SECONDS,
  isServableMime,
} from "@/shared/services/attachment-limits";
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

/**
 * Ready files only. The owner is redirected to a short-lived signed URL.
 * Anyone else gets the file only when it sits on a public ready card,
 * with Content-Disposition: attachment and a mime from the upload allowlist.
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

  if (!row || row.bucket !== CARD_ATTACHMENTS_BUCKET || row.status !== "ready") return notFound();

  const viewer = await viewerId();
  const owner = viewer === row.owner_id;
  if (!owner) {
    if (!isServableMime(row.mime)) return notFound();
    try {
      if (!(await attachmentIsPublic(attachmentId))) return notFound();
    } catch {
      return NextResponse.json({ error: "Could not read the file" }, { status: 500 });
    }
  }

  const admin = createAdminSupabaseClient();
  const signed = await admin.storage.from(row.bucket).createSignedUrl(
    row.storage_path,
    SIGNED_READ_SECONDS,
    owner ? undefined : { download: downloadName(row.original_name, row.id) },
  );
  if (signed.error || !signed.data?.signedUrl) {
    return NextResponse.json({ error: "Could not open the file" }, { status: 500 });
  }

  return NextResponse.redirect(signed.data.signedUrl, 302);
}
