import { NextResponse } from "next/server";
import { requireOwnerId } from "@/shared/services/attachment-api";
import { readAccountStatus } from "@/shared/services/trial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const owner = await requireOwnerId();
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status });

  try {
    const status = await readAccountStatus(owner.id);
    return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[trial] status", error);
    return NextResponse.json({ error: "Could not read the account" }, { status: 500 });
  }
}
