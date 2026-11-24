import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The share already happened in the browser. This used to count it. An old client may still call. */
export async function POST() {
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
