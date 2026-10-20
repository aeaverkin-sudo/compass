import { NextResponse } from "next/server";
import { requireOwnerId } from "@/shared/services/attachment-api";
import { walletConfigured } from "@/shared/services/wallet-pass";
import { cardPassRegistered } from "@/shared/services/wallet-registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: { configured: boolean; added?: boolean }, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** The Wallet buttons ask first, so a tap never lands on a bare 503. `?card=` also says whether that pass is in Wallet. */
export async function GET(request: Request) {
  const configured = walletConfigured();
  const cardId = new URL(request.url).searchParams.get("card");
  if (!cardId) return json({ configured });
  if (!UUID.test(cardId)) return json({ configured, added: false }, 404);
  const owner = await requireOwnerId();
  if (!owner.ok) return json({ configured, added: false }, owner.status);
  try {
    return json({ configured, added: await cardPassRegistered(owner.id, cardId) });
  } catch (error) {
    console.error("[wallet] status", error instanceof Error ? error.message : error);
    return json({ configured, added: false }, 500);
  }
}
