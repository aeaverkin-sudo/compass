import { NextResponse } from "next/server";
import { IMAGE_MIMES } from "@/shared/services/attachment-limits";
import { downloadAttachmentBytes, loadAttachment } from "@/shared/services/attachment-api";
import { loadEventInvite } from "@/shared/services/event-invite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOGO_MIMES = new Set<string>([...IMAGE_MIMES, "image/svg+xml"]);

/** The cover mark for this invite. Any other file stays private. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const event = await loadEventInvite(code);
  if (!event?.logoAttachmentId) return new NextResponse(null, { status: 404 });

  const row = await loadAttachment(event.logoAttachmentId);
  if (!row || row.status !== "ready" || !LOGO_MIMES.has(row.mime)) {
    return new NextResponse(null, { status: 404 });
  }

  const bytes = await downloadAttachmentBytes(row);
  if (!bytes) return new NextResponse(null, { status: 404 });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
