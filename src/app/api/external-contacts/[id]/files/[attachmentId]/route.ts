import { NextResponse } from "next/server";
import { readExternalContact } from "@/features/contact-collect/store";
import { contactFilePath, contactFileReadable } from "@/features/contact-collect/contact-files";
import { isUuid, loadAttachment, requireOwnerId, safeOriginalName } from "@/shared/services/attachment-api";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import {
  CONTACT_FILES_BUCKET,
  SIGNED_READ_SECONDS,
  isInlineViewableMime,
} from "@/shared/services/attachment-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ id: string; attachmentId: string }> };

function nosniff(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function notFound() {
  return nosniff(NextResponse.json({ error: "Not found" }, { status: 404 }));
}

function disposition(name: string | null, id: string, mime: string) {
  const cleaned = (safeOriginalName(name) ?? id).replace(/["\\;]/g, "") || id;
  const ascii = cleaned.replace(/[^\x20-\x7E]/g, "_");
  const mode = isInlineViewableMime(mime) ? "inline" : "attachment";
  return `${mode}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(cleaned)}`;
}

/** A saved contact's file. The link must still be on that contact. */
export async function GET(_request: Request, context: RouteProps) {
  const owner = await requireOwnerId();
  if (!owner.ok) return nosniff(NextResponse.json({ error: owner.error }, { status: owner.status }));

  const { id, attachmentId } = await context.params;
  if (!isUuid(id) || !isUuid(attachmentId)) return notFound();

  let contact;
  let row;
  try {
    [contact, row] = await Promise.all([readExternalContact(owner.id, id), loadAttachment(attachmentId)]);
  } catch (error) {
    console.error("[external-contacts] file", error instanceof Error ? error.message : error);
    return nosniff(NextResponse.json({ error: "Could not open the file" }, { status: 500 }));
  }
  if (!contact.ok || !row) return notFound();

  const allowed = contactFileReadable({
    viewerId: owner.id,
    ownerId: row.owner_id,
    linked: contact.contact.files.some((file) => file.id === attachmentId),
    status: row.status,
    bucket: row.bucket,
    bucketName: CONTACT_FILES_BUCKET,
    path: row.storage_path,
    expectedPath: contactFilePath(owner.id, id, attachmentId),
  });
  if (!allowed) return notFound();

  const admin = createAdminSupabaseClient();
  const signed = await admin.storage.from(row.bucket).createSignedUrl(row.storage_path, SIGNED_READ_SECONDS);
  if (signed.error || !signed.data?.signedUrl) {
    return nosniff(NextResponse.json({ error: "Could not open the file" }, { status: 500 }));
  }

  const range = _request.headers.get("range");
  const upstream = await fetch(signed.data.signedUrl, range ? { headers: { Range: range } } : {});
  if (!upstream.ok && upstream.status !== 206) {
    return nosniff(NextResponse.json({ error: "Could not open the file" }, { status: 500 }));
  }

  const headers = new Headers();
  headers.set("Content-Type", row.mime || "application/octet-stream");
  headers.set("Content-Disposition", disposition(row.original_name, row.id, row.mime));
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);
  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
