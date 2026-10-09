import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Saves a public card into the signed-in book. Same upsert as `/save/{token}`,
 * without leaving the card.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user || user.is_anonymous) return noStore({ error: "Sign in" }, 401);

  let token = "";
  try {
    const body = (await request.json()) as { token?: unknown };
    token = typeof body.token === "string" ? body.token.trim() : "";
  } catch {
    return noStore({ error: "Could not read the card" }, 400);
  }
  if (!TOKEN_RE.test(token)) return noStore({ error: "Not found" }, 404);

  const admin = createAdminSupabaseClient();
  const card = await admin.from("cards").select("id, owner_id").eq("public_token", token).maybeSingle();
  if (card.error) return noStore({ error: "Could not save the card" }, 500);
  if (!card.data) return noStore({ error: "Not found" }, 404);
  if (card.data.owner_id === user.id) return noStore({ error: "own" }, 409);

  const saved = await admin.from("connections").upsert(
    { owner_id: user.id, saved_card_id: card.data.id, state: "active" },
    { onConflict: "owner_id,saved_card_id", ignoreDuplicates: true },
  );
  if (saved.error) {
    if (/cannot_save_own_card/i.test(saved.error.message)) return noStore({ error: "own" }, 409);
    return noStore({ error: "Could not save the card" }, 500);
  }
  return noStore({ ok: true });
}
