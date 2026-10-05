import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { acceptManagerInvite } from "@/shared/services/event-manage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string }> };

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: RouteProps) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user || data.user.is_anonymous) return noStore({ error: "Sign in to accept." }, 401);

  const { code } = await context.params;
  let token = "";
  try {
    const body = (await request.json()) as { token?: unknown };
    token = typeof body.token === "string" ? body.token : "";
  } catch {
    return noStore({ error: "This link has already been used." }, 404);
  }
  if (!token) return noStore({ error: "This link has already been used." }, 404);

  try {
    const result = await acceptManagerInvite(code, data.user.id, token);
    if (!result.ok) return noStore({ error: result.error }, result.status);
    return noStore({ ok: true });
  } catch (error) {
    console.error("[events] manager accept", error);
    return noStore({ error: "Could not accept." }, 500);
  }
}
