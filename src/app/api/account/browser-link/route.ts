import { NextResponse } from "next/server";
import { publicOrigin } from "@/shared/lib/public-origin";
import { sessionUser } from "@/shared/lib/supabase/session-user";
import { saveBrowserLink } from "@/shared/services/browser-link";
import { mintWelcomeToken } from "@/shared/services/welcome-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** A signed-in in-app tab asks for a link the person pastes into Safari or Chrome. */
export async function POST(request: Request) {
  const user = await sessionUser();
  if (!user || user.is_anonymous || !user.email) return noStore({ error: "Sign in." }, 401);
  const token = mintWelcomeToken();
  try {
    await saveBrowserLink(user.id, token);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/browser_link_/i.test(message)) return noStore({ error: "Not ready." }, 503);
    return noStore({ error: "Could not copy." }, 500);
  }
  const url = `${publicOrigin(request)}/handoff?t=${encodeURIComponent(token)}`;
  return noStore({ url });
}
