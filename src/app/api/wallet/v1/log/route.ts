import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Wallet posts its own diagnostics. Nothing here is stored. */
export function POST() {
  return new NextResponse(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}
