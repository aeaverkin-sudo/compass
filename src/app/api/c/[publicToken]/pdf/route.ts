import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonFail(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * A live card PDF is painted in the browser from the same `/c/` card.
 * A frozen trial stays on that card until the account is deleted.
 */
export async function GET() {
  return jsonFail(404, "Not found");
}

export async function POST() {
  return jsonFail(404, "Not found");
}
