import { NextResponse } from "next/server";
import { sessionUser } from "@/shared/lib/supabase/session-user";
import { declineInvitation } from "@/shared/services/event-invite-inbox";
import { loadEventInvite } from "@/shared/services/event-invite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string }> };

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Not going: by the personal token, or the signed-in member's own registration. */
export async function POST(request: Request, context: RouteProps) {
  const { code } = await context.params;
  let token: string | null = null;
  try {
    const body = (await request.json()) as { token?: unknown };
    token = typeof body.token === "string" && /^[A-Za-z0-9_-]{21}$/.test(body.token) ? body.token : null;
  } catch {
    token = null;
  }
  const event = await loadEventInvite(code);
  if (!event) return noStore({ error: "Event not found" }, 404);
  const user = await sessionUser();
  try {
    const result = await declineInvitation(event.id, user?.id ?? null, token);
    if (!result.ok) return noStore({ error: result.error }, result.status);
    return noStore({ ok: true });
  } catch (error) {
    console.error("[events] decline", error);
    return noStore({ error: "Could not save that." }, 500);
  }
}
