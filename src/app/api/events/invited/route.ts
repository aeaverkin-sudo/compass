import { NextResponse } from "next/server";
import { publicOrigin } from "@/shared/lib/public-origin";
import { requireOwnerId } from "@/shared/services/attachment-api";
import { loadInbox } from "@/shared/services/event-invite-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Invitations to this account with no answer yet. The count is the digit on Network. */
export async function GET(request: Request) {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ invited: [], declined: [], count: 0 });
  try {
    const inbox = await loadInbox(owner.id, publicOrigin(request));
    return noStore({ ...inbox, count: inbox.invited.length });
  } catch (error) {
    console.error("[events] invited", error);
    return noStore({ error: "Could not load invitations." }, 500);
  }
}
