import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { mailOrigin } from "@/shared/lib/public-origin";
import { requestIp } from "@/shared/services/event-pass-guard";
import { acceptGuestPass } from "@/shared/services/member-account";
import { acceptReply, noStore } from "@/shared/services/http-reply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string }> };

/** I'm going on a personal link. POST only, so a link preview never accepts. */
export async function POST(request: Request, context: RouteProps) {
  const { code } = await context.params;
  let token: unknown = null;
  let timeZone: unknown = null;
  let source: unknown = null;
  try {
    const body = (await request.json()) as { token?: unknown; timeZone?: unknown; source?: unknown };
    token = body.token;
    timeZone = body.timeZone;
    source = body.source;
  } catch {
    token = null;
  }

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const session = data.user ? { id: data.user.id, anonymous: Boolean(data.user.is_anonymous) } : null;
  const from =
    source === "mail"
      ? { source: "mail" as const, origin: mailOrigin(request), ip: requestIp(request) }
      : { source: "page" as const, origin: mailOrigin(request) };

  try {
    return acceptReply(await acceptGuestPass(code, token, session, timeZone, from));
  } catch (error) {
    console.error("[events] guest accept", error);
    return noStore({ error: "Could not open your pass." }, 500);
  }
}
