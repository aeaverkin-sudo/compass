import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { loadEventInvite } from "@/shared/services/event-invite";
import { markPaidFromReturn } from "@/shared/services/event-payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string }> };

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(_request: Request, context: RouteProps) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return noStore({ error: "Sign in first." }, 401);
  const { code } = await context.params;
  const event = await loadEventInvite(code);
  if (!event) return noStore({ error: "Event not found" }, 404);

  try {
    const marked = await markPaidFromReturn(event.id, data.user.id);
    if (!marked) return noStore({ error: "Join the event first." }, 404);
    return noStore({ ok: true });
  } catch (error) {
    console.error("[events] payment said", error);
    return noStore({ error: "Could not save that." }, 500);
  }
}
