import { NextResponse } from "next/server";
import { isUuid, requireOwnerId } from "@/shared/services/attachment-api";
import { cardOwnedBy, sealSentTransfer } from "@/shared/services/notes-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The share's files are stored. Mark that one batch sent. A pending row is left pending. */
export async function POST(request: Request) {
  const owner = await requireOwnerId();
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }
  const record = body && typeof body === "object" ? (body as { cardId?: unknown; token?: unknown }) : {};
  if (typeof record.cardId !== "string" || !isUuid(record.cardId)) {
    return NextResponse.json({ error: "Expected a card" }, { status: 400 });
  }
  if (typeof record.token !== "string") {
    return NextResponse.json({ error: "Expected a code" }, { status: 400 });
  }

  try {
    if (!(await cardOwnedBy(record.cardId, owner.id))) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }
    const ready = await sealSentTransfer(record.cardId, record.token);
    return NextResponse.json({ ready }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not send the note" }, { status: 500 });
  }
}
