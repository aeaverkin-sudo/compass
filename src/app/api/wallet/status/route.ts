import { NextResponse } from "next/server";
import { walletConfigured } from "@/shared/services/wallet-pass";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The Wallet buttons ask first, so a tap never lands on a bare 503. */
export async function GET() {
  return NextResponse.json({ configured: walletConfigured() }, { headers: { "Cache-Control": "no-store" } });
}
