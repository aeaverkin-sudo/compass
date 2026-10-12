import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { resolveNamePair } from "@/shared/services/event-guest-lists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string }> };

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: RouteProps) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return noStore({ error: "Sign in first." }, 401);
  const { code } = await context.params;
  let body: { a?: unknown; b?: unknown; action?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return noStore({ error: "Bad request" }, 400);
  }
  if (typeof body.a !== "string" || typeof body.b !== "string" || (body.action !== "merge" && body.action !== "keep")) {
    return noStore({ error: "Bad request" }, 400);
  }
  try {
    const result = await resolveNamePair(code, data.user.id, body.a, body.b, body.action);
    if (!result.ok) return noStore({ error: result.error }, result.status);
    return noStore({ ok: true });
  } catch (error) {
    console.error("[events] guest name pair", error);
    return noStore({ error: "Could not save that." }, 500);
  }
}
