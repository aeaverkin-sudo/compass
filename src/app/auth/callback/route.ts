import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { clearTrialClock } from "@/shared/services/trial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Google returns here after linkIdentity or signInWithOAuth. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const next = url.searchParams.get("next") || "/main";
  const described = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (described) {
    const taken = /already|identity|exists/i.test(described);
    const target = taken ? "/register?taken=1" : `/register?error=${encodeURIComponent(described)}`;
    return NextResponse.redirect(new URL(target, origin));
  }

  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/register", origin));

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const taken = /already|identity|exists/i.test(error.message);
    const target = taken ? "/register?taken=1" : `/register?error=${encodeURIComponent(error.message)}`;
    return NextResponse.redirect(new URL(target, origin));
  }

  const { data } = await supabase.auth.getUser();
  if (data.user && !data.user.is_anonymous) {
    try {
      await clearTrialClock(data.user.id);
    } catch (clockError) {
      console.error("[auth] clear trial", clockError);
    }
  }

  return NextResponse.redirect(new URL(next, origin));
}
