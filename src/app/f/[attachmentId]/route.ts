import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { isUuid, loadAttachment, safeOriginalName, type AttachmentRow } from "@/shared/services/attachment-api";
import {
  CARD_ATTACHMENTS_BUCKET,
  SIGNED_READ_SECONDS,
  TRANSFER_ASSETS_BUCKET,
  isImageMime,
  isInlineViewableMime,
  isServableMime,
} from "@/shared/services/attachment-limits";
import { attachmentIsPublic } from "@/shared/services/public-card";

export const runtime = "nodejs";

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

function serverError(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
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

function dispositionHeader(row: AttachmentRow): string {
  const filename = downloadName(row.original_name, row.id);
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  // PDFs and images render in place; office files download so iOS opens them in an app.
  const mode = isInlineViewableMime(row.mime) ? "inline" : "attachment";
  return `${mode}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Serves a stored file.
 * Images redirect straight to the CDN for speed. Everything else is proxied from
 * this domain — PDFs open inline, office files download for the native viewer —
 * with Range forwarded so previews can seek.
 * The owner sees any of their files; a stranger only a servable file on a public card.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ attachmentId: string }> },
) {
  const { attachmentId } = await context.params;
  if (!isUuid(attachmentId)) return notFound();

  let row: AttachmentRow | null;
  try {
    row = await loadAttachment(attachmentId);
  } catch {
    return serverError("Could not read the file");
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
      return serverError("Could not read the file");
    }
  }

  const admin = createAdminSupabaseClient();
  const signed = await admin.storage.from(row.bucket).createSignedUrl(row.storage_path, SIGNED_READ_SECONDS);
  if (signed.error || !signed.data?.signedUrl) return serverError("Could not open the file");

  // Images load from the CDN directly (cached, no proxy hop).
  if (isImageMime(row.mime)) return NextResponse.redirect(signed.data.signedUrl, 302);

  const range = request.headers.get("range");
  const upstream = await fetch(signed.data.signedUrl, range ? { headers: { Range: range } } : {});
  if (!upstream.ok && upstream.status !== 206) return serverError("Could not open the file");

  const headers = new Headers();
  headers.set("Content-Type", row.mime || "application/octet-stream");
  headers.set("Content-Disposition", dispositionHeader(row));
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, max-age=0, must-revalidate");
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
