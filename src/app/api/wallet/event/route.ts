import { NextResponse } from "next/server";
import { publicOrigin } from "@/shared/lib/public-origin";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { pkpassResponseHeaders, walletConfigured } from "@/shared/services/wallet-pass";
import { buildEventPass, nearestEventLookup } from "@/shared/services/wallet-passes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** The guest pass screen has no event address: the pass is for the nearest event ahead. */
export async function GET(request: Request) {
  if (!walletConfigured()) return noStore({ error: "wallet_not_configured" }, 503);
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return noStore({ error: "Unauthorized" }, 401);

  try {
    const lookup = await nearestEventLookup(data.user.id);
    const pass = lookup ? await buildEventPass(lookup, data.user.id, publicOrigin(request)) : null;
    if (!pass) return noStore({ error: "No pass for this event." }, 404);
    return new NextResponse(new Uint8Array(pass.file), { headers: pkpassResponseHeaders(pass.name) });
  } catch (error) {
    console.error("[wallet] guest event", error instanceof Error ? error.message : error);
    return noStore({ error: "Could not make the pass." }, 500);
  }
}
