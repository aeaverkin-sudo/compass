import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { resolveWelcomeToken } from "@/shared/services/welcome-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function signIn(origin: string, email?: string) {
  const query = new URLSearchParams({ signin: "1" });
  if (email) query.set("email", email);
  return NextResponse.redirect(new URL(`/register?${query}`, origin));
}

/** The welcome letter. A live token mints a one-time sign-in at the moment of the tap. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const door = await resolveWelcomeToken(url.searchParams.get("t") ?? "");
  if (door.kind === "signin") return signIn(url.origin, door.email);

  const admin = createAdminSupabaseClient();
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: door.email });
  const hashed = link.data?.properties?.hashed_token;
  if (link.error || !hashed) return signIn(url.origin, door.email);

  const confirm = new URL("/auth/confirm", url.origin);
  confirm.searchParams.set("token_hash", hashed);
  confirm.searchParams.set("type", "magiclink");
  return NextResponse.redirect(confirm);
}
