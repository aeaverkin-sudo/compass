import { NextResponse } from "next/server";
import { sessionUser } from "@/shared/lib/supabase/session-user";
import { markGuestPaid } from "@/shared/services/event-payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string; userId: string }> };

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, context: RouteProps) {
  const user = await sessionUser();
  if (!user) return noStore({ error: "Sign in to mark a guest." }, 401);
  const { code, userId } = await context.params;

  let paid = false;
  try {
    const body = (await request.json()) as { paid?: unknown };
    paid = body.paid === true;
  } catch {
    return noStore({ error: "Could not update the guest." }, 400);
  }

  try {
    const result = await markGuestPaid(code, user.id, userId, paid);
    if (!result.ok) return noStore({ error: result.error }, result.status);
    return noStore({ ok: true });
  } catch (error) {
    console.error("[events] payment mark", error);
    return noStore({ error: "Could not update the guest." }, 500);
  }
}
