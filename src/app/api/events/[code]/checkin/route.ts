import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { checkInByCard, checkInGuest } from "@/shared/services/event-manage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string }> };

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request, context: RouteProps) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return noStore({ error: "Sign in to check in." }, 401);

  const { code } = await context.params;
  let regToken = "";
  let cardToken = "";
  let handle = "";
  let confirm = false;
  try {
    const body = (await request.json()) as { regToken?: unknown; cardToken?: unknown; handle?: unknown; confirm?: unknown };
    regToken = text(body.regToken);
    cardToken = text(body.cardToken);
    handle = text(body.handle);
    confirm = body.confirm === true;
  } catch {
    return noStore({ error: "Event badge not found" }, 404);
  }
  if (!regToken && !cardToken && !handle) return noStore({ error: "Event badge not found" }, 404);

  try {
    const result = regToken
      ? await checkInGuest(code, data.user.id, regToken, confirm)
      : await checkInByCard(code, data.user.id, cardToken ? { token: cardToken } : { handle }, confirm);
    if (!result.ok) return noStore({ error: result.error }, result.status);
    if (result.status === "pending") return noStore({ status: "pending", name: result.name, payCode: result.payCode });
    return noStore({ status: result.status, name: result.name, at: result.at });
  } catch (error) {
    console.error("[events] check-in", error);
    return noStore({ error: "Could not check in." }, 500);
  }
}
