import { NextResponse } from "next/server";
import { isUuid, requireOwnerId } from "@/shared/services/attachment-api";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { noteProductCount } from "@/shared/services/product-stats-record";
import { connectionCountAction } from "@/shared/services/product-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Accept a card that was shared back. A row that is already kept is not counted again. */
export async function POST(request: Request) {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ error: owner.error }, owner.status);

  let id = "";
  try {
    const body = (await request.json()) as { id?: unknown };
    id = typeof body.id === "string" ? body.id : "";
  } catch {
    id = "";
  }
  if (!isUuid(id)) return noStore({ error: "Missing contact" }, 400);

  try {
    const admin = createAdminSupabaseClient();
    const row = await admin.from("connections").select("id, state").eq("id", id).eq("owner_id", owner.id).maybeSingle();
    if (row.error) throw new Error(row.error.message);
    if (!row.data) return noStore({ error: "Not found" }, 404);
    if (row.data.state !== "pending") return noStore({ ok: true });
    const updated = await admin
      .from("connections")
      .update({ state: "active" })
      .eq("id", id)
      .eq("owner_id", owner.id)
      .eq("state", "pending")
      .select("id");
    if (updated.error) throw new Error(updated.error.message);
    if ((updated.data ?? []).length > 0) {
      await noteProductCount({ action: connectionCountAction("accepted") });
    }
    return noStore({ ok: true });
  } catch {
    console.error("[connections] accept");
    return noStore({ error: "Could not keep the card" }, 500);
  }
}
