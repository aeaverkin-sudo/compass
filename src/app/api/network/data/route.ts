import { NextResponse } from "next/server";
import { requireOwnerId } from "@/shared/services/attachment-api";
import { cardStatsSince, readCardData, resetCardStats } from "@/shared/services/card-stats";
import { dataDeskOpen } from "@/shared/services/desk-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ error: owner.error }, owner.status);
  if (!dataDeskOpen()) return noStore({ error: "Not available" }, 404);

  try {
    const url = new URL(request.url);
    const card = url.searchParams.get("card");
    const all = url.searchParams.get("all") === "1";
    const since = all || !card ? null : await cardStatsSince(owner.id, card);
    const data = await readCardData(owner.id, card, since);
    return noStore({ ...data, since });
  } catch (error) {
    console.error("[network] data", error);
    return noStore({ error: "Could not read data" }, 500);
  }
}

export async function POST(request: Request) {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ ok: false }, owner.status);
  if (!dataDeskOpen()) return noStore({ error: "Not available" }, 404);

  try {
    const card = new URL(request.url).searchParams.get("card");
    if (!card) return noStore({ ok: false });
    const data = await resetCardStats(owner.id, card);
    if (!data) return noStore({ ok: false });
    return noStore({ ok: true, ...data });
  } catch (error) {
    console.error("[network] reset", error);
    return noStore({ ok: false });
  }
}
