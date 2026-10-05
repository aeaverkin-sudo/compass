import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { createManagerInvite, permissionsOf } from "@/shared/services/event-manage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string }> };

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: RouteProps) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return noStore({ error: "Sign in to assign a manager." }, 401);

  const { code } = await context.params;
  let permissions = permissionsOf(null);
  try {
    const body = (await request.json()) as { permissions?: unknown };
    permissions = permissionsOf(body.permissions);
  } catch {
    return noStore({ error: "Choose a permission." }, 400);
  }

  try {
    const result = await createManagerInvite(code, data.user.id, permissions);
    if (!result.ok) return noStore({ error: result.error }, result.status);
    if (!("token" in result)) return noStore({ error: "Could not create the link." }, 500);
    return noStore({ token: result.token, publicToken: result.publicToken });
  } catch (error) {
    console.error("[events] manager invite", error);
    return noStore({ error: "Could not create the link." }, 500);
  }
}
