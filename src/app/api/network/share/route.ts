import { NextResponse } from "next/server";
import { requireOwnerId } from "@/shared/services/attachment-api";
import { recordCardShare } from "@/shared/services/card-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ error: owner.error }, owner.status);

  let cardId = "";
  try {
    const body = (await request.json()) as { cardId?: unknown };
    cardId = typeof body.cardId === "string" ? body.cardId : "";
  } catch {
    return noStore({ error: "Could not read the share" }, 400);
  }

  try {
    const saved = await recordCardShare(owner.id, cardId);
    if (!saved) return noStore({ error: "Could not record the share" }, 404);
    return noStore({ ok: true });
  } catch (error) {
    console.error("[network] share", error);
    return noStore({ error: "Could not record the share" }, 500);
  }
}
