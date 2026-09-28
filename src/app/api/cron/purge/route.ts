import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deletes expired unregistered trials and stale starter-code rows.
 * Call with `Authorization: Bearer $CRON_SECRET`. There is no manual delete.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.rpc("purge_expired_trials");
    if (error) throw new Error(error.message);
    return NextResponse.json(
      { removed: typeof data === "number" ? data : 0 },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[trial] purge", error);
    return NextResponse.json({ error: "Could not purge" }, { status: 500 });
  }
}
