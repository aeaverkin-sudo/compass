import { NextResponse } from "next/server";
import { isUuid, requireOwnerId } from "@/shared/services/attachment-api";
import { cardOwnedBy, ensurePendingTransfer } from "@/shared/services/notes-server";

export const runtime = "nodejs";

function jsonFail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/** Opens the single pending transfer so a selfie or voice can be stored against it. */
export async function POST(request: Request) {
  const owner = await requireOwnerId();
  if (!owner.ok) return jsonFail(owner.status, owner.error);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonFail(400, "Expected JSON");
  }
  const cardId = body && typeof body === "object" ? (body as { cardId?: unknown }).cardId : undefined;
  if (typeof cardId !== "string" || !isUuid(cardId)) return jsonFail(400, "Expected a card");

  try {
    if (!(await cardOwnedBy(cardId, owner.id))) return jsonFail(404, "Card not found");
    const transferId = await ensurePendingTransfer(cardId);
    return NextResponse.json({ transferId }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return jsonFail(500, "Could not open the note");
  }
}
