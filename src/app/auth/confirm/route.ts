import { NextResponse } from "next/server";
import { publicOrigin } from "@/shared/lib/public-origin";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One-time sign-in from the welcome letter. token_hash, not PKCE, so another browser can open it. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = publicOrigin(request);
  const tokenHash = url.searchParams.get("token_hash") ?? "";
  const type = url.searchParams.get("type");
  const signIn = new URL("/register?signin=1", origin);
  if (type !== "magiclink" || !tokenHash) return NextResponse.redirect(signIn);

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (error) return NextResponse.redirect(signIn);
  return NextResponse.redirect(new URL("/main", origin));
}
