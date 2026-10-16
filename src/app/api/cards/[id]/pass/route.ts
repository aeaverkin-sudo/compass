import { NextResponse } from "next/server";
import { publicOrigin } from "@/shared/lib/public-origin";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { requireOwnerId } from "@/shared/services/attachment-api";
import { walletLinkValid } from "@/shared/services/wallet-link";
import { pkpassResponseHeaders, walletConfigured } from "@/shared/services/wallet-pass";
import { buildPersonalPass } from "@/shared/services/wallet-passes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** The signed mail link names the card; its owner comes from the card. */
async function signedOwner(request: Request, cardId: string): Promise<string | null> {
  const params = new URL(request.url).searchParams;
  if (!walletLinkValid(cardId, params.get("e"), params.get("s"))) return null;
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("cards").select("owner_id").eq("id", cardId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { owner_id?: string | null } | null)?.owner_id ?? null;
}

/** The personal Wallet pass of my card. The welcome mail opens it by a signed link, without a sign-in. */
export async function GET(request: Request, context: RouteProps) {
  if (!walletConfigured()) return noStore({ error: "wallet_not_configured" }, 503);
  const { id } = await context.params;
  if (!UUID.test(id)) return noStore({ error: "Portfolio not found." }, 404);
  const signed = new URL(request.url).searchParams.has("s");
  let ownerId: string | null;
  if (signed) {
    ownerId = await signedOwner(request, id).catch(() => null);
    if (!ownerId) return noStore({ error: "This link has expired. Open Profile to add the card." }, 403);
  } else {
    const owner = await requireOwnerId();
    if (!owner.ok) return noStore({ error: owner.error }, owner.status);
    ownerId = owner.id;
  }

  try {
    const pass = await buildPersonalPass(id, ownerId, publicOrigin(request));
    if (!pass) return noStore({ error: "Portfolio not found." }, 404);
    return new NextResponse(new Uint8Array(pass.file), { headers: pkpassResponseHeaders(pass.name || "card") });
  } catch (error) {
    console.error("[wallet] personal", error instanceof Error ? error.message : error);
    return noStore({ error: "Could not make the pass." }, 500);
  }
}
