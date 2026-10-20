import { NextResponse } from "next/server";
import { isEventInvitePath, isEventJoinPath, isEventTeamPath } from "@/shared/event/lookup";
import { publicOrigin } from "@/shared/lib/public-origin";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { listOwnPortfolios } from "@/shared/services/event-registration";
import { sourceCardToken } from "@/shared/services/source-card";
import { clearTrialClock } from "@/shared/services/trial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same-origin path only. A prefix check lets `/\evil.com` through: the URL parser turns `\` into `/`. */
function safeNext(raw: string | null, origin: string): string {
  if (!raw) return "/main";
  try {
    const u = new URL(raw, origin);
    return u.origin === origin ? u.pathname + u.search + u.hash : "/main";
  } catch {
    return "/main";
  }
}

/** Google returns here after linkIdentity or signInWithOAuth. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = publicOrigin(request);
  const next = safeNext(url.searchParams.get("next"), origin);
  const source = sourceCardToken(url.searchParams.get("card"));
  const described = url.searchParams.get("error_description") || url.searchParams.get("error");
  const keepNext =
    next.startsWith("/save/") || isEventJoinPath(next) || isEventTeamPath(next) || isEventInvitePath(next)
      ? `&next=${encodeURIComponent(next)}`
      : "";
  const carry = `${keepNext}${source ? `&card=${encodeURIComponent(source)}` : ""}`;
  const errorCode = url.searchParams.get("error_code") ?? "";
  const errorParam = url.searchParams.get("error") ?? "";
  const already =
    errorCode === "identity_already_exists" ||
    errorCode === "email_exists" ||
    errorParam === "identity_already_exists" ||
    errorParam === "email_exists";
  if (already) {
    return NextResponse.redirect(new URL(`/register?google=1${carry}`, origin));
  }
  if (described) {
    const taken = /already|identity|exists/i.test(described);
    const target = taken
      ? `/register?taken=1${carry}`
      : `/register?error=${encodeURIComponent(described)}${carry}`;
    return NextResponse.redirect(new URL(target, origin));
  }

  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL(`/register?signin=1${carry}`, origin));

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const taken = /already|identity|exists/i.test(error.message);
    const target = taken
      ? `/register?taken=1${carry}`
      : `/register?error=${encodeURIComponent(error.message)}${carry}`;
    return NextResponse.redirect(new URL(target, origin));
  }

  const { data } = await supabase.auth.getUser();
  const keeps =
    next.startsWith("/save/") || isEventJoinPath(next) || isEventTeamPath(next) || isEventInvitePath(next);
  let destination = next;
  if (data.user && !data.user.is_anonymous) {
    try {
      await clearTrialClock(data.user.id);
    } catch (clockError) {
      console.error("[auth] clear trial", clockError);
    }
    if (!keeps) {
      try {
        const cards = await listOwnPortfolios(data.user.id);
        const ready = cards.some((row) => row.name.trim() || row.photoAttachmentId);
        if (!ready) destination = source ? `/create?card=${encodeURIComponent(source)}` : "/create";
        else if (source) destination = `/save/${encodeURIComponent(source)}`;
      } catch (portfolioError) {
        console.error("[auth] portfolio", portfolioError);
        if (source) destination = `/main?card=${encodeURIComponent(source)}`;
      }
    }
  }

  return NextResponse.redirect(new URL(destination, origin));
}
