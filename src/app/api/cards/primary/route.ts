import { NextResponse } from "next/server";
import { requireOwnerId } from "@/shared/services/attachment-api";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";

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
  const admin = createAdminSupabaseClient();
  const loaded = await admin.from("cards").select("id").eq("owner_id", owner.id).eq("is_primary", true).limit(1).maybeSingle();
  if (loaded.error) return noStore({ cardId: null });
  return noStore({ cardId: (loaded.data as { id: string } | null)?.id ?? null });
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

  const admin = createAdminSupabaseClient();
  const updated = await admin
    .from("cards")
    .update({ is_primary: true })
    .eq("id", cardId)
    .eq("owner_id", owner.id)
    .select("id");
  if (updated.error) {
    console.error("[cards] primary", updated.error.message);
    return noStore({ error: "Could not put it in Wallet." }, 500);
  }
  if ((updated.data ?? []).length === 0) return noStore({ error: "Portfolio not found." }, 404);
  return noStore({ cardId });
}
