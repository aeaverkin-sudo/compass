import { NextResponse } from "next/server";
import {
  downloadAttachmentBytes,
  isUuid,
  loadAttachment,
} from "@/shared/services/attachment-api";
import { CARD_ATTACHMENTS_BUCKET, TRANSFER_ASSETS_BUCKET } from "@/shared/services/attachment-limits";
import { cardPdfFilename, generatePublicCardPdf } from "@/shared/services/card-pdf";
import { consumedNoteAttachmentIds } from "@/shared/services/notes-server";
import type { DeliveredNote } from "@/shared/services/notes-types";
import { loadPublicCard } from "@/shared/services/public-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ publicToken: string }> };

function jsonFail(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

function parseNotes(value: unknown): DeliveredNote[] {
  if (!Array.isArray(value)) return [];
  const notes: DeliveredNote[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const note = entry as Record<string, unknown>;
    const type = note.type;
    if (type !== "text" && type !== "selfie") continue;
    notes.push({
      id: typeof note.id === "string" ? note.id : crypto.randomUUID(),
      type,
      content: typeof note.content === "string" ? note.content : "",
      url: typeof note.url === "string" ? note.url : "",
      attachmentId: typeof note.attachmentId === "string" ? note.attachmentId : undefined,
      expired: Boolean(note.expired),
    });
  }
  return notes;
}

/**
 * Builds a portfolio PDF from the public card projection.
 * Notes are whatever this viewer already received — no second consume.
 * Nothing is written to Storage.
 */
export async function GET(request: Request, context: RouteProps) {
  return POST(new Request(request.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }), context);
}

export async function POST(request: Request, context: RouteProps) {
  const { publicToken } = await context.params;

  let loaded;
  try {
    loaded = await loadPublicCard(publicToken);
  } catch {
    return jsonFail(500, "Could not read the card");
  }
  if (!loaded) return jsonFail(404, "Not found");

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const requested = parseNotes(
    body && typeof body === "object" ? (body as { notes?: unknown }).notes : undefined,
  );

  let allowedSelfies = new Set<string>();
  try {
    allowedSelfies = await consumedNoteAttachmentIds(
      loaded.card.id,
      requested.flatMap((note) => (note.attachmentId ? [note.attachmentId] : [])),
    );
  } catch {
    return jsonFail(500, "Could not read notes");
  }

  const notes = requested
    .filter((note) => note.type === "text" || note.type === "selfie")
    .map((note) => {
      if (note.type !== "selfie") return note;
      if (!note.attachmentId || !allowedSelfies.has(note.attachmentId)) {
        return { ...note, attachmentId: undefined, expired: true };
      }
      return note;
    });

  let photoBytes: Uint8Array | null = null;
  let photoMime: string | null = null;
  const photoId = loaded.card.photoAttachmentId;
  if (photoId && isUuid(photoId)) {
    try {
      const row = await loadAttachment(photoId);
      if (row && row.bucket === CARD_ATTACHMENTS_BUCKET && row.status === "ready") {
        photoBytes = await downloadAttachmentBytes(row);
        photoMime = row.mime;
      }
    } catch {
      photoBytes = null;
    }
  }

  const noteImages: Record<string, { bytes: Uint8Array; mime: string }> = {};
  for (const note of notes) {
    if (note.type !== "selfie" || !note.attachmentId || noteImages[note.attachmentId]) continue;
    try {
      const row = await loadAttachment(note.attachmentId);
      if (!row || row.bucket !== TRANSFER_ASSETS_BUCKET || row.status !== "ready") continue;
      const bytes = await downloadAttachmentBytes(row);
      if (bytes) noteImages[note.attachmentId] = { bytes, mime: row.mime };
    } catch {
      // Selfie skipped; the PDF still ships.
    }
  }

  let pdf: Uint8Array;
  try {
    pdf = await generatePublicCardPdf({
      card: loaded.card,
      items: loaded.items,
      photoBytes,
      photoMime,
      notes,
      noteImages,
    });
  } catch (error) {
    console.error("[pdf] generate failed", error);
    return jsonFail(500, "Could not build the PDF");
  }

  const filename = cardPdfFilename(loaded.card.displayName);
  const asciiName = filename.replace(/[^\x20-\x7E]/g, "_");
  // Copy into a fresh ArrayBuffer-backed Uint8Array for the Response body.
  const bodyBytes = Uint8Array.from(pdf);

  return new NextResponse(bodyBytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
      "Content-Length": String(bodyBytes.byteLength),
    },
  });
}
