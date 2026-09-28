import { NextResponse } from "next/server";
import { requireOwnerId } from "@/shared/services/attachment-api";
import { startTrialClock } from "@/shared/services/trial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Called at Confirm. Does not run on anonymous sign-in. */
export async function POST() {
  const owner = await requireOwnerId();
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status });

  try {
    const status = await startTrialClock(owner.id);
    return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[trial] start", error);
    return NextResponse.json({ error: "Could not start the trial" }, { status: 500 });
  }
}
