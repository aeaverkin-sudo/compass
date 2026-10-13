import { NextResponse } from "next/server";
import { publicOrigin } from "@/shared/lib/public-origin";
import { requireOwnerId } from "@/shared/services/attachment-api";
import { pkpassResponseHeaders, walletConfigured } from "@/shared/services/wallet-pass";
import { buildPersonalPass } from "@/shared/services/wallet-passes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** The personal Wallet pass of my card. */
export async function GET(request: Request, context: RouteProps) {
  if (!walletConfigured()) return noStore({ error: "wallet_not_configured" }, 503);
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ error: owner.error }, owner.status);
  const { id } = await context.params;
  if (!UUID.test(id)) return noStore({ error: "Portfolio not found." }, 404);

  try {
    const pass = await buildPersonalPass(id, owner.id, publicOrigin(request));
    if (!pass) return noStore({ error: "Portfolio not found." }, 404);
    return new NextResponse(new Uint8Array(pass.file), { headers: pkpassResponseHeaders(pass.name || "card") });
  } catch (error) {
    console.error("[wallet] personal", error instanceof Error ? error.message : error);
    return noStore({ error: "Could not make the pass." }, 500);
  }
}
