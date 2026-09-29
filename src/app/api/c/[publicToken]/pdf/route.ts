import { NextResponse } from "next/server";
import {
  downloadAttachmentBytes,
  isUuid,
  loadAttachment,
} from "@/shared/services/attachment-api";
import { CARD_ATTACHMENTS_BUCKET, TRANSFER_ASSETS_BUCKET } from "@/shared/services/attachment-limits";
import { cardPdfFilename, generateInactiveCardPdf, generatePublicCardPdf } from "@/shared/services/card-pdf";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { consumedNoteAttachmentIds, readPendingNotes } from "@/shared/services/notes-server";
import type { DeliveredNote } from "@/shared/services/notes-types";
import { loadPublicCard } from "@/shared/services/public-card";
import type { NextScanAddon } from "@/shared/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ publicToken: string }> };

function jsonFail(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Public https origin. Render's own request URL is internal, so the proxy headers win. */
function publicOrigin(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwarded || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "https";
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}

function pendingAsDelivered(notes: NextScanAddon[]): DeliveredNote[] {
  return notes.flatMap((note) => {
    if (note.type !== "text" && note.type !== "selfie") return [];
    return [
      {
        id: note.id,
        type: note.type,
        content: note.type === "text" ? note.content : "",
        url: "",
        attachmentId: note.attachmentId,
        expired: note.type === "selfie" && !note.attachmentId,
      },
    ];
  });
}

async function requestUserId(): Promise<string | null> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
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
  const headers = new Headers({ "Content-Type": "application/json" });
  for (const name of ["x-forwarded-proto", "x-forwarded-host", "host"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return POST(new Request(request.url, { method: "POST", headers, body: "{}" }), context);
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
  if (loaded.inactive) {
    const bytes = await generateInactiveCardPdf();
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="portfolio-inactive.pdf"',
        "Cache-Control": "no-store",
      },
    });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const requested = parseNotes(
    body && typeof body === "object" ? (body as { notes?: unknown }).notes : undefined,
  );

  let notes: DeliveredNote[];
  const userId = await requestUserId();
  if (userId && userId === loaded.ownerId) {
    try {
      notes = pendingAsDelivered(await readPendingNotes(loaded.card.id));
    } catch {
      return jsonFail(500, "Could not read notes");
    }
  } else {
    let allowedSelfies = new Set<string>();
    try {
      allowedSelfies = await consumedNoteAttachmentIds(
        loaded.card.id,
        requested.flatMap((note) => (note.attachmentId ? [note.attachmentId] : [])),
      );
    } catch {
      return jsonFail(500, "Could not read notes");
    }

    notes = requested
      .filter((note) => note.type === "text" || note.type === "selfie")
      .map((note) => {
        if (note.type !== "selfie") return note;
        if (!note.attachmentId || !allowedSelfies.has(note.attachmentId)) {
          return { ...note, attachmentId: undefined, expired: true };
        }
        return note;
      });
  }

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
      origin: publicOrigin(request),
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
