import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { walletLinkValid } from "@/shared/services/wallet-link";
import { walletConfigured } from "@/shared/services/wallet-pass";
import { cardPassRegistered } from "@/shared/services/wallet-registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** The mail's signed link, without a sign-in. `added` is the live device registration. */
export async function GET(request: Request, context: RouteProps) {
  const { id } = await context.params;
  if (!UUID.test(id)) return json({ error: "expired" }, 404);
  const params = new URL(request.url).searchParams;
  try {
    if (!walletLinkValid(id, params.get("e"), params.get("s"))) return json({ error: "expired" }, 403);
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.from("cards").select("owner_id").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    const ownerId = (data as { owner_id?: string | null } | null)?.owner_id ?? null;
    if (!ownerId) return json({ error: "expired" }, 403);
    return json({
      configured: walletConfigured(),
      added: await cardPassRegistered(ownerId, id),
    });
  } catch (error) {
    console.error("[wallet] signed status", error instanceof Error ? error.message : error);
    return json({ error: "status" }, 500);
  }
}
