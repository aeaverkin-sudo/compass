import { NextResponse } from "next/server";
import { publicOrigin } from "@/shared/lib/public-origin";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { claimBrowserLink } from "@/shared/services/browser-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function signIn(origin: string, email?: string) {
  const query = new URLSearchParams({ signin: "1" });
  if (email) query.set("email", email);
  return NextResponse.redirect(new URL(`/register?${query}`, origin));
}

/** The copied link. Same sign-in as the letter, then the token is spent. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = publicOrigin(request);
  const door = await claimBrowserLink(url.searchParams.get("t") ?? "");
  if (door.kind === "signin") return signIn(origin, door.email);

  const admin = createAdminSupabaseClient();
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: door.email });
  const hashed = link.data?.properties?.hashed_token;
  if (link.error || !hashed) return signIn(origin, door.email);

  const confirm = new URL("/auth/confirm", origin);
  confirm.searchParams.set("token_hash", hashed);
  confirm.searchParams.set("type", "magiclink");
  return NextResponse.redirect(confirm);
}
