import { NextResponse } from "next/server";
import { sessionUser } from "@/shared/lib/supabase/session-user";
import { objectToProductCounts } from "@/shared/services/product-stats-record";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** The signed-in account objects to totals linked to it. This is not required to sign in. */
export async function POST() {
  const user = await sessionUser();
  if (!user || user.is_anonymous) return noStore({ error: "Sign in first." }, 401);

  try {
    await objectToProductCounts(user.id);
    return noStore({ ok: true });
  } catch {
    console.error("[product-count] objection");
    return noStore({ error: "Could not save the objection." }, 503);
  }
}
