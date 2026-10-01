import { NextResponse } from "next/server";
import { fail, isUuid, requireOwnerId } from "@/shared/services/attachment-api";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Writes a pending row into the other person's book.
 * The browser cannot: that row's owner_id is not the viewer.
 * An existing active or pending row is left as it is.
 */
export async function POST(request: Request) {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ error: owner.error }, owner.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStore({ error: "Missing card" }, 400);
  }

  const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const fromCardId = typeof payload.fromCardId === "string" ? payload.fromCardId : "";
  const toCardId = typeof payload.toCardId === "string" ? payload.toCardId : "";
  const toCardToken = typeof payload.toCardToken === "string" ? payload.toCardToken.trim() : "";

  if (!isUuid(fromCardId)) return noStore({ error: "Missing card" }, 400);
  if (toCardId && !isUuid(toCardId)) return noStore({ error: "Missing card" }, 400);
  if (!toCardId && !TOKEN_RE.test(toCardToken)) return noStore({ error: "Missing card" }, 400);

  try {
    const admin = createAdminSupabaseClient();
    const from = await admin.from("cards").select("id, owner_id").eq("id", fromCardId).maybeSingle();
    if (from.error) throw new Error(from.error.message);
    if (!from.data || from.data.owner_id !== owner.id) {
      return noStore({ error: fail(403, "That card is not yours").error }, 403);
    }

    const toQuery = admin.from("cards").select("id, owner_id, public_token");
    const to = toCardId
      ? await toQuery.eq("id", toCardId).maybeSingle()
      : await toQuery.eq("public_token", toCardToken).maybeSingle();
    if (to.error) throw new Error(to.error.message);
    if (!to.data) return noStore({ error: "Card not found" }, 404);
    if (toCardId && toCardToken && to.data.public_token !== toCardToken) {
      return noStore({ error: "Card not found" }, 404);
    }
    if (to.data.owner_id === owner.id) return noStore({ error: "That card is yours" }, 400);

    const inserted = await admin.from("connections").upsert(
      {
        owner_id: to.data.owner_id,
        saved_card_id: from.data.id,
        state: "pending",
      },
      { onConflict: "owner_id,saved_card_id", ignoreDuplicates: true },
    );
    if (inserted.error) throw new Error(inserted.error.message);

    return noStore({ ok: true });
  } catch (error) {
    console.error("[connections] share-back", error);
    return noStore({ error: "Could not share the card" }, 500);
  }
}
