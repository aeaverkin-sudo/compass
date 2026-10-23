import { NextResponse } from "next/server";
import { isUuid, requireOwnerId } from "@/shared/services/attachment-api";
import { armPendingNotes, cardOwnedBy } from "@/shared/services/notes-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Share was pressed. Keep the notes for one link open and hide them from the next scan. */
export async function POST(request: Request) {
  const owner = await requireOwnerId();
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }
  const cardId = body && typeof body === "object" ? (body as { cardId?: unknown }).cardId : undefined;
  if (typeof cardId !== "string" || !isUuid(cardId)) {
    return NextResponse.json({ error: "Expected a card" }, { status: 400 });
  }

  try {
    if (!(await cardOwnedBy(cardId, owner.id))) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }
    await armPendingNotes(cardId);
  } catch {
    return NextResponse.json({ error: "Could not close notes" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
