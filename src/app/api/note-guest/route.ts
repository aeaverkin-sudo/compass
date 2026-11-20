import { NextResponse } from "next/server";
import { sessionUser } from "@/shared/lib/supabase/session-user";
import { bindSessionReceipts } from "@/shared/services/bind-note-receipts";
import { ensureGuestClaimId } from "@/shared/services/note-guest-claim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ensures the httpOnly guest claim cookie exists before a Notes delivery POST.
 * Idempotent. Does not reveal the claim id to JavaScript.
 * A signed-in session also pulls any open guest receipts into Network.
 */
export async function POST() {
  await ensureGuestClaimId();
  try {
    const user = await sessionUser();
    if (user && !user.is_anonymous) await bindSessionReceipts(user.id);
  } catch (reason) {
    console.error("[note-guest] bind", reason);
  }
  return NextResponse.json(
    { ok: true },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
