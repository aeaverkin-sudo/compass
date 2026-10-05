import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { checkInGuest } from "@/shared/services/event-manage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string }> };

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: RouteProps) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return noStore({ error: "Sign in to check in." }, 401);

  const { code } = await context.params;
  let regToken = "";
  try {
    const body = (await request.json()) as { regToken?: unknown };
    regToken = typeof body.regToken === "string" ? body.regToken : "";
  } catch {
    return noStore({ error: "Event badge not found" }, 404);
  }
  if (!regToken) return noStore({ error: "Event badge not found" }, 404);

  try {
    const result = await checkInGuest(code, data.user.id, regToken);
    if (!result.ok) return noStore({ error: result.error }, result.status);
    if (result.status === "unpaid") return noStore({ status: "unpaid", name: result.name });
    return noStore({ status: result.status, name: result.name, at: result.at });
  } catch (error) {
    console.error("[events] check-in", error);
    return noStore({ error: "Could not check in." }, 500);
  }
}
