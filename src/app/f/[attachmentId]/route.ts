import { NextResponse } from "next/server";
import { publicOrigin } from "@/shared/lib/public-origin";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { isUuid, loadAttachment, safeOriginalName, type AttachmentRow } from "@/shared/services/attachment-api";
import {
  CARD_ATTACHMENTS_BUCKET,
  SIGNED_READ_SECONDS,
  TRANSFER_ASSETS_BUCKET,
  isImageMime,
  isInlineViewableMime,
  isOfficeDocMime,
  isServableMime,
} from "@/shared/services/attachment-limits";
import { attachmentIsPublic } from "@/shared/services/public-card";

export const runtime = "nodejs";

const IMMUTABLE_CACHE = "private, max-age=31536000, immutable";

function nosniff(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

function notFound() {
  return nosniff(NextResponse.json({ error: "Not found" }, { status: 404 }));
}

function serverError(message: string) {
  return nosniff(NextResponse.json({ error: message }, { status: 500 }));
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
 * Images are sent from here with a year-long private cache, so a repeat visit is instant.
 * PDFs/audio/video are proxied inline
 * from this domain with Range forwarded so previews can seek. Office files open in the
 * Microsoft Office web viewer, which fetches the raw bytes back from `?raw=1`.
 * The owner sees any of their files; a stranger only a servable file on a public card.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ attachmentId: string }> },
) {
  const { attachmentId } = await context.params;
  if (!isUuid(attachmentId)) return notFound();

  // Bytes behind an id never change, so a cached copy is always current.
  const etag = `"${attachmentId}"`;
  if (request.headers.get("if-none-match") === etag) {
    return nosniff(new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": IMMUTABLE_CACHE } }));
  }

  let row: AttachmentRow | null;
  let viewer: string | null;
  try {
    [row, viewer] = await Promise.all([loadAttachment(attachmentId), viewerId()]);
  } catch {
    return serverError("Could not read the file");
  }
  if (!row || row.status !== "ready") return notFound();

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
      return serverError("Could not read the file");
    }
  }

  // Office files can't render in a browser — open them in Microsoft's web viewer,
  // which pulls the raw bytes back from this same route (`?raw=1`).
  const wantRaw = new URL(request.url).searchParams.get("raw") === "1";
  if (isOfficeDocMime(row.mime) && !wantRaw) {
    const rawUrl = `${publicOrigin(request)}/f/${attachmentId}?raw=1`;
    const viewer = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(rawUrl)}`;
    return nosniff(NextResponse.redirect(viewer, 302));
  }

  const admin = createAdminSupabaseClient();

  if (isImageMime(row.mime)) {
    const image = await admin.storage.from(row.bucket).download(row.storage_path);
    if (image.error || !image.data) return serverError("Could not open the file");
    return new NextResponse(image.data, {
      headers: {
        "Content-Type": row.mime,
        "Content-Length": String(image.data.size),
        "Content-Disposition": dispositionHeader(row),
        "Cache-Control": IMMUTABLE_CACHE,
        ETag: etag,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const signed = await admin.storage.from(row.bucket).createSignedUrl(row.storage_path, SIGNED_READ_SECONDS);
  if (signed.error || !signed.data?.signedUrl) return serverError("Could not open the file");

  const range = request.headers.get("range");
  const upstream = await fetch(signed.data.signedUrl, range ? { headers: { Range: range } } : {});
  if (!upstream.ok && upstream.status !== 206) return serverError("Could not open the file");

  const headers = new Headers();
  headers.set("Content-Type", row.mime || "application/octet-stream");
  headers.set("Content-Disposition", dispositionHeader(row));
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, max-age=0, must-revalidate");
  headers.set("X-Content-Type-Options", "nosniff");
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
