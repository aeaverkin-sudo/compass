import { NextResponse } from "next/server";
import { requireOwnerId } from "@/shared/services/attachment-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Stub until M1. Real matching needs contacts and embeddings.
 * The screen already renders whatever list this returns.
 */
export async function POST(request: Request) {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ error: owner.error }, owner.status);

  const body = (await request.json().catch(() => null)) as { query?: unknown } | null;
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  if (!query) return noStore({ matches: [] });

  return noStore({ matches: [] });
}
