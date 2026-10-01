import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { clearTrialClock } from "@/shared/services/trial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Google returns here after linkIdentity or signInWithOAuth. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const requested = url.searchParams.get("next") || "/main";
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/main";
  const described = url.searchParams.get("error_description") || url.searchParams.get("error");
  const keepNext = next.startsWith("/save/") ? `&next=${encodeURIComponent(next)}` : "";
  if (described) {
    const taken = /already|identity|exists/i.test(described);
    const target = taken
      ? `/register?taken=1${keepNext}`
      : `/register?error=${encodeURIComponent(described)}${keepNext}`;
    return NextResponse.redirect(new URL(target, origin));
  }

  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL(`/register?signin=1${keepNext}`, origin));

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const taken = /already|identity|exists/i.test(error.message);
    const target = taken
      ? `/register?taken=1${keepNext}`
      : `/register?error=${encodeURIComponent(error.message)}${keepNext}`;
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
