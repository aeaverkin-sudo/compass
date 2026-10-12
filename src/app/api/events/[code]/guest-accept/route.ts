import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { GUEST_COOKIE } from "@/shared/services/event-guest-pass";
import { acceptGuestPass } from "@/shared/services/guest-accept";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string }> };

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** I'm going on a personal link. POST only, so a link preview never accepts. */
export async function POST(request: Request, context: RouteProps) {
  const { code } = await context.params;
  let token: unknown = null;
  try {
    token = ((await request.json()) as { token?: unknown }).token;
  } catch {
    token = null;
  }

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const session = data.user ? { id: data.user.id, anonymous: Boolean(data.user.is_anonymous) } : null;

  try {
    const result = await acceptGuestPass(code, token, session);
    if (!result.ok) return noStore({ error: result.error }, result.status);
    if (result.kind === "go") {
      const response = noStore({ kind: "go", next: result.next });
      if (result.carryToken && typeof token === "string") {
        response.cookies.set(GUEST_COOKIE, token, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 60 * 60,
        });
      }
      return response;
    }
    if (result.kind === "signin") return noStore({ kind: "signin", tokenHash: result.tokenHash, cardId: result.cardId });
    if (result.kind === "here") return noStore({ kind: "here", cardId: result.cardId });
    return noStore({ kind: "other-device" });
  } catch (error) {
    console.error("[events] guest accept", error);
    return noStore({ error: "Could not open your pass." }, 500);
  }
}
