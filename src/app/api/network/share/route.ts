import { NextResponse } from "next/server";
import { isUuid } from "@/shared/services/attachment-api";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { sessionUser } from "@/shared/lib/supabase/session-user";
import { noteProductCount } from "@/shared/services/product-stats-record";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * The Link action in ADED ME. This does not say the message was delivered.
 * A card that is not the caller's is not counted. An old client may still call.
 */
export async function POST(request: Request) {
  const user = await sessionUser();
  if (!user) return noStore({ ok: true });

  let cardId = "";
  try {
    const body = (await request.json()) as { cardId?: unknown };
    cardId = typeof body.cardId === "string" ? body.cardId : "";
  } catch {
    cardId = "";
  }
  if (!isUuid(cardId)) return noStore({ ok: true });

  try {
    const admin = createAdminSupabaseClient();
    const card = await admin.from("cards").select("id, owner_id").eq("id", cardId).maybeSingle();
    if (card.error || !card.data || card.data.owner_id !== user.id) return noStore({ ok: true });
    await noteProductCount({ action: "share_link", cardId: card.data.id, ownerId: card.data.owner_id });
    return noStore({ ok: true });
  } catch {
    console.error("[product-count] share");
    return noStore({ ok: true });
  }
}
