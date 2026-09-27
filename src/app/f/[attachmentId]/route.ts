import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { isUuid, loadAttachment } from "@/shared/services/attachment-api";
import {
  CARD_ATTACHMENTS_BUCKET,
  SIGNED_READ_SECONDS,
  TRANSFER_ASSETS_BUCKET,
  isServableMime,
} from "@/shared/services/attachment-limits";
import { attachmentIsPublic } from "@/shared/services/public-card";

export const runtime = "nodejs";

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
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
 * Redirect to a short-lived signed URL. Storage serves the object directly,
 * so images load from the CDN and PDFs preview inline with range support.
 * The owner sees any of their files; a stranger only sees a servable file that
 * sits on a public ready card. Everything else is 404, so a private id never leaks.
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

  const owner = (await viewerId()) === row.owner_id;

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

  const admin = createAdminSupabaseClient();
  const signed = await admin.storage.from(row.bucket).createSignedUrl(row.storage_path, SIGNED_READ_SECONDS);
  if (signed.error || !signed.data?.signedUrl) {
    return NextResponse.json({ error: "Could not open the file" }, { status: 500 });
  }
  return NextResponse.redirect(signed.data.signedUrl, 302);
}
