import { NextResponse } from "next/server";
import { sessionUser } from "@/shared/lib/supabase/session-user";
import { mintWelcomeToken, saveHandoffToken } from "@/shared/services/welcome-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function publicOrigin(request: Request): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (site && /^https?:\/\//i.test(site)) return site;
  return new URL(request.url).origin;
}

/** A signed-in Telegram tab asks for a link that signs the same person into Safari or Chrome. */
export async function POST(request: Request) {
  const user = await sessionUser();
  if (!user || user.is_anonymous || !user.email) return noStore({ error: "Sign in." }, 401);
  const token = mintWelcomeToken();
  try {
    await saveHandoffToken(user.id, token);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/handoff_token_hash/i.test(message)) return noStore({ error: "Not ready." }, 503);
    return noStore({ error: "Could not open the browser." }, 500);
  }
  const url = `${publicOrigin(request)}/open?t=${encodeURIComponent(token)}`;
  return noStore({ url });
}
