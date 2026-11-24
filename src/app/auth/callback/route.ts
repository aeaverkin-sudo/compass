import { NextResponse } from "next/server";
import { doorNext, questionnaireHref } from "@/app/create/door";
import { oauthCallbackBind } from "@/shared/lib/fill-place";
import { publicOrigin } from "@/shared/lib/public-origin";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { CONSENT_VERSION } from "@/shared/services/consent";
import { bindSessionReceipts } from "@/shared/services/bind-note-receipts";
import { saveConnection } from "@/shared/services/save-connection";
import { sendWelcomeMail } from "@/shared/services/cold-entry";
import { registrationMethod } from "@/shared/services/product-stats";
import { clearTrialClock } from "@/shared/services/trial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Where a finished Google sign-in may land. Anything else is the portfolio. */
function destination(origin: string, next: string | null) {
  return new URL(doorNext(next) ?? "/main", origin);
}

/** No card yet: the questionnaire. Signing in does not create one or copy a provider name. */
async function afterGoogle(origin: string, userId: string, next: string | null) {
  const admin = createAdminSupabaseClient();
  const cards = await admin.from("cards").select("id", { count: "exact", head: true }).eq("owner_id", userId);
  if (cards.error || (cards.count ?? 0) > 0) {
    return { url: destination(origin, next), portfolio: !cards.error && (cards.count ?? 0) > 0 };
  }
  const saved = await keepScannedCard(admin, userId, next);
  const url = new URL(questionnaireHref(doorNext(next) ?? null), origin);
  url.searchParams.set("account", "1");
  if (saved) url.searchParams.set("saved", "1");
  return { url, portfolio: false };
}

/** The card they opened, saved into this session before the questionnaire. A miss does not stop sign-in. */
async function keepScannedCard(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  userId: string,
  next: string | null,
) {
  const safe = doorNext(next);
  if (!safe?.startsWith("/save/")) return false;
  try {
    const card = await admin
      .from("cards")
      .select("id, owner_id")
      .eq("public_token", safe.slice("/save/".length))
      .maybeSingle();
    if (card.error || !card.data || card.data.owner_id === userId) {
      if (card.error) console.error("[auth] callback");
      return false;
    }
    const saved = await saveConnection({ ownerId: userId, cardId: card.data.id });
    if (!saved.ok) {
      if (!saved.own) console.error("[auth] callback");
      return false;
    }
    await bindSessionReceipts(userId);
    return true;
  } catch {
    console.error("[auth] callback");
    return false;
  }
}

/** A cancelled or failed Google page returns to the screen that opened it. No reason is shown. */
function back(origin: string, from: string | null, next: string | null) {
  const safe = doorNext(next);
  if (from === "create") return new URL(questionnaireHref(safe ?? null), origin);
  const url = new URL("/register", origin);
  url.searchParams.set("signin", "1");
  if (from === "signin" && safe) url.searchParams.set("next", safe);
  return url;
}

/** The first Google entry agrees to the same terms. A row already stored is left as it is. */
async function rememberConsent(userId: string) {
  const admin = createAdminSupabaseClient();
  const existing = await admin.from("consents").select("id").eq("user_id", userId).limit(1).maybeSingle();
  if (existing.error) throw new Error("consent");
  if (existing.data) return;
  const inserted = await admin.from("consents").insert({
    user_id: userId,
    document_version: CONSENT_VERSION,
    path: "register",
  });
  if (inserted.error) throw new Error("consent");
}

/** Google returns here. The code is spent on the server. The address never carries a token. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = publicOrigin(request);
  const from = url.searchParams.get("from");
  const next = url.searchParams.get("next");
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error") || url.searchParams.get("error_description") || !code) {
    if (url.searchParams.get("error") || url.searchParams.get("error_description")) console.error("[auth] callback");
    return NextResponse.redirect(back(origin, from, next));
  }

  const supabase = await createServerSupabaseClient();
  const exchanged = await supabase.auth.exchangeCodeForSession(code);
  if (exchanged.error) {
    console.error("[auth] callback");
    return NextResponse.redirect(back(origin, from, next));
  }

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user || user.is_anonymous) {
    console.error("[auth] callback");
    return NextResponse.redirect(back(origin, from, next));
  }

  const asked = url.searchParams.get("provider");
  const providers = new Set((user.identities ?? []).map((identity) => identity.provider));
  const access =
    (asked === "apple" || asked === "google") && (providers.size === 0 || providers.has(asked))
      ? asked
      : providers.has("apple") && !providers.has("google")
        ? "apple"
        : "google";
  try {
    await clearTrialClock(user.id, registrationMethod(asked, [...providers]));
  } catch {
    console.error("[auth] callback");
  }
  try {
    await rememberConsent(user.id);
  } catch {
    console.error("[auth] callback");
  }
  await bindSessionReceipts(user.id);
  const landing = await afterGoogle(origin, user.id, next);
  void sendWelcomeMail(user.id, origin, access, landing.portfolio).catch((error) => {
    console.error("[mail] welcome", error instanceof Error ? error.message : "send failed");
  });

  const response = NextResponse.redirect(landing.url);
  const bind = oauthCallbackBind({
    queryAttemptId: url.searchParams.get("attempt"),
    cookieAttemptId: null,
    userId: user.id,
    confirmed: Boolean(user.email_confirmed_at),
    fromCreate: from === "create",
    questionnaire: !landing.portfolio && landing.url.pathname === "/create",
    now: Date.now(),
  });
  if (bind) {
    response.cookies.set({
      name: "aded_oauth_bind",
      value: JSON.stringify(bind),
      path: "/",
      maxAge: 120,
      sameSite: "lax",
      httpOnly: false,
    });
  }
  return response;
}
