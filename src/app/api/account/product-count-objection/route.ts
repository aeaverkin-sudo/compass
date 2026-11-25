import { NextResponse } from "next/server";
import { sessionUser } from "@/shared/lib/supabase/session-user";
import { objectionGet } from "@/shared/services/product-stats";
import { objectToProductCounts, productCountsObjected } from "@/shared/services/product-stats-record";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Whether this account has already turned the linked totals off. */
export async function GET() {
  const user = await sessionUser();
  if (!user || user.is_anonymous) {
    const guest = objectionGet({ signedIn: false });
    return noStore(guest.body, guest.status);
  }
  try {
    const read = objectionGet({ signedIn: true, objected: await productCountsObjected(user.id) });
    return noStore(read.body, read.status);
  } catch {
    console.error("[product-count] objection");
    const failed = objectionGet({ signedIn: true, failed: true });
    return noStore(failed.body, failed.status);
  }
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
