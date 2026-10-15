import { NextResponse } from "next/server";
import { requireOwnerId } from "@/shared/services/attachment-api";
import { primaryCardId, setPrimaryCard } from "@/shared/services/primary-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** The card in Wallet: the owner's primary card. One per owner. */
export async function GET() {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ error: owner.error }, owner.status);
  try {
    return noStore({ cardId: await primaryCardId(owner.id) });
  } catch {
    return noStore({ cardId: null });
  }
}

/** Put in Wallet: this card becomes the primary one, and the personal pass carries its QR. */
export async function POST(request: Request) {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ error: owner.error }, owner.status);
  let cardId = "";
  try {
    const body = (await request.json()) as { cardId?: unknown };
    cardId = typeof body.cardId === "string" ? body.cardId : "";
  } catch {
    cardId = "";
  }
  if (!UUID.test(cardId)) return noStore({ error: "Portfolio not found." }, 404);

  try {
    if (!(await setPrimaryCard(owner.id, cardId))) return noStore({ error: "Portfolio not found." }, 404);
  } catch (error) {
    console.error("[cards] primary", error instanceof Error ? error.message : error);
    return noStore({ error: "Could not put it in Wallet." }, 500);
  }
  return noStore({ cardId });
}
