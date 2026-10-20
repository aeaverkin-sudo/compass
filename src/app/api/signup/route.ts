import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { GUEST_COOKIE } from "@/shared/services/event-guest-pass";
import { createSignup, type SignupBody } from "@/shared/services/signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (status === 201) {
    response.cookies.set(GUEST_COOKIE, "", { path: "/", maxAge: 0 });
  }
  return response;
}

export async function POST(request: Request) {
  let body: SignupBody;
  try {
    body = (await request.json()) as SignupBody;
  } catch {
    return noStore({ error: "Expected JSON" }, 400);
  }

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const session = user ? { id: user.id, anonymous: Boolean(user.is_anonymous) } : null;

  try {
    const result = await createSignup(body, session);
    if (!result.ok) {
      return noStore(result.kind ? { error: result.error, kind: result.kind } : { error: result.error }, result.status);
    }
    return noStore({ cardId: result.cardId, next: result.next }, 201);
  } catch (error) {
    console.error("[signup]", error);
    return noStore({ error: "Could not create the portfolio." }, 500);
  }
}
