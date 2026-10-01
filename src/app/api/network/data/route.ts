import { NextResponse } from "next/server";
import { requireOwnerId } from "@/shared/services/attachment-api";
import { readCardData } from "@/shared/services/card-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ error: owner.error }, owner.status);

  try {
    const card = new URL(request.url).searchParams.get("card");
    return noStore(await readCardData(owner.id, card));
  } catch (error) {
    console.error("[network] data", error);
    return noStore({ error: "Could not read data" }, 500);
  }
}
