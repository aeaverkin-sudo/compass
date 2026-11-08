import { NextResponse } from "next/server";
import { fail, isUuid, requireOwnerId } from "@/shared/services/attachment-api";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { saveConnection } from "@/shared/services/save-connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Share back: my card is offered to the other person's book.
 * It arrives pending. If they turned shared-back cards off, nothing is written and the answer says declined.
 * The browser cannot write it: that row's owner_id is not the viewer. A row already there stays.
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

    const prior = await admin
      .from("connections")
      .select("id, state")
      .eq("owner_id", to.data.owner_id)
      .eq("saved_card_id", from.data.id)
      .maybeSingle();
    if (prior.error) throw new Error(prior.error.message);
    if (prior.data) return noStore({ ok: true, pendingId: null });

    const profile = await admin.from("profiles").select("accept_share_back").eq("id", to.data.owner_id).maybeSingle();
    if (profile.error) {
      if (!/accept_share_back/i.test(profile.error.message)) throw new Error(profile.error.message);
    } else if (profile.data?.accept_share_back === false) {
      return noStore({ ok: true, pendingId: null, declined: true });
    }

    const inserted = await saveConnection({
      ownerId: to.data.owner_id,
      cardId: from.data.id,
      state: "pending",
    });
    if (!inserted.ok) throw new Error(inserted.message);

    const created = await admin
      .from("connections")
      .select("id, state")
      .eq("owner_id", to.data.owner_id)
      .eq("saved_card_id", from.data.id)
      .maybeSingle();
    if (created.error) throw new Error(created.error.message);
    const pendingId = created.data?.state === "pending" ? String(created.data.id) : null;
    return noStore({ ok: true, pendingId });
  } catch (error) {
    console.error("[connections] share-back", error);
    return noStore({ error: "Could not share the card" }, 500);
  }
}

/** Undo inside three seconds. Deletes the pending row this send just created. */
export async function DELETE(request: Request) {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ error: owner.error }, owner.status);

  let pendingId = "";
  try {
    const body = (await request.json()) as { pendingId?: unknown };
    pendingId = typeof body.pendingId === "string" ? body.pendingId : "";
  } catch {
    pendingId = "";
  }
  if (!isUuid(pendingId)) return noStore({ error: "Missing card" }, 400);

  try {
    const admin = createAdminSupabaseClient();
    const row = await admin.from("connections").select("id, state, saved_card_id").eq("id", pendingId).maybeSingle();
    if (row.error) throw new Error(row.error.message);
    if (!row.data || row.data.state !== "pending") return noStore({ ok: true });
    const card = await admin.from("cards").select("owner_id").eq("id", row.data.saved_card_id).maybeSingle();
    if (card.error) throw new Error(card.error.message);
    if (!card.data || card.data.owner_id !== owner.id) return noStore({ error: "That card is not yours" }, 403);
    const removed = await admin.from("connections").delete().eq("id", pendingId).eq("state", "pending");
    if (removed.error) throw new Error(removed.error.message);
    return noStore({ ok: true });
  } catch (error) {
    console.error("[connections] share-back undo", error);
    return noStore({ error: "Could not take the card back" }, 500);
  }
}
