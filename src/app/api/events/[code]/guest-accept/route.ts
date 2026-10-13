import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { acceptGuestPass } from "@/shared/services/guest-accept";
import { acceptReply, noStore } from "@/shared/services/guest-accept-reply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string }> };

/** Create my pass, or I'm going, on a personal link. POST only, so a link preview never accepts. */
export async function POST(request: Request, context: RouteProps) {
  const { code } = await context.params;
  let token: unknown = null;
  let timeZone: unknown = null;
  try {
    const body = (await request.json()) as { token?: unknown; timeZone?: unknown };
    token = body.token;
    timeZone = body.timeZone;
  } catch {
    token = null;
  }

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const session = data.user ? { id: data.user.id, anonymous: Boolean(data.user.is_anonymous) } : null;

  try {
    return acceptReply(await acceptGuestPass(code, token, session, timeZone));
  } catch (error) {
    console.error("[events] guest accept", error);
    return noStore({ error: "Could not open your pass." }, 500);
  }
}
