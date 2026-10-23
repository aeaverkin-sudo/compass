import { NextResponse } from "next/server";
import { isUuid, requireOwnerId } from "@/shared/services/attachment-api";
import { cardOwnedBy, readPendingNotes, writePendingNotes, type NoteWrite } from "@/shared/services/notes-server";
import type { NextScanAddonType } from "@/shared/types";

export const runtime = "nodejs";

function jsonFail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

type Owned =
  | { ok: true; ownerId: string; cardId: string }
  | { ok: false; response: NextResponse };

async function ownedCard(cardId: unknown): Promise<Owned> {
  const owner = await requireOwnerId();
  if (!owner.ok) return { ok: false, response: jsonFail(owner.status, owner.error) };
  if (typeof cardId !== "string" || !isUuid(cardId)) {
    return { ok: false, response: jsonFail(400, "Expected a card") };
  }
  try {
    if (!(await cardOwnedBy(cardId, owner.id))) {
      return { ok: false, response: jsonFail(404, "Card not found") };
    }
  } catch {
    return { ok: false, response: jsonFail(500, "Could not read the card") };
  }
  return { ok: true, ownerId: owner.id, cardId };
}

export async function GET(request: Request) {
  const cardId = new URL(request.url).searchParams.get("cardId");
  const owned = await ownedCard(cardId);
  if (!owned.ok) return owned.response;

  try {
    const notes = await readPendingNotes(owned.cardId);
    return noStore({ notes });
  } catch {
    return jsonFail(500, "Could not read notes");
  }
}

function isNoteType(value: unknown): value is NextScanAddonType {
  return value === "text" || value === "selfie" || value === "voice";
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonFail(400, "Expected JSON");
  }
  if (!body || typeof body !== "object") return jsonFail(400, "Expected JSON");

  const record = body as { cardId?: unknown; notes?: unknown };
  const owned = await ownedCard(record.cardId);
  if (!owned.ok) return owned.response;
  if (!Array.isArray(record.notes)) return jsonFail(400, "Expected notes");

  const notes: NoteWrite[] = [];
  for (const entry of record.notes) {
    if (!entry || typeof entry !== "object") return jsonFail(400, "Expected notes");
    const note = entry as { type?: unknown; content?: unknown; attachmentId?: unknown };
    if (!isNoteType(note.type)) return jsonFail(400, "Unsupported note");
    notes.push({
      type: note.type,
      content: typeof note.content === "string" ? note.content : "",
      attachmentId: typeof note.attachmentId === "string" ? note.attachmentId : undefined,
    });
  }

  try {
    await writePendingNotes(owned.cardId, owned.ownerId, notes);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "File is not on this note" || message === "Missing file") {
      return jsonFail(400, "File is not on this note");
    }
    return jsonFail(500, "Could not save notes");
  }

  return noStore({ ok: true });
}
