import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { saveEventPay } from "@/shared/services/event-payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string }> };

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, context: RouteProps) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return noStore({ error: "Sign in to edit payment." }, 401);
  const { code } = await context.params;

  let body: {
    isPaid?: unknown;
    howTo?: unknown;
    price?: unknown;
    currency?: unknown;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return noStore({ error: "Could not save payment." }, 400);
  }

  try {
    const result = await saveEventPay(code, data.user.id, body);
    if (!result.ok) return noStore({ error: result.error }, result.status);
    return noStore({ ok: true });
  } catch (error) {
    console.error("[events] payment save", error);
    return noStore({ error: "Could not save payment." }, 500);
  }
}
