import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { createOpenPass } from "@/shared/services/guest-accept";
import { acceptReply, noStore } from "@/shared/services/guest-accept-reply";
import { requestIp } from "@/shared/services/event-pass-guard";
import { mailOrigin } from "@/shared/lib/public-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string }> };

/** Create my pass on the open link: a name and an email or a phone. */
export async function POST(request: Request, context: RouteProps) {
  const { code } = await context.params;
  let body: { name?: unknown; contact?: unknown; timeZone?: unknown; website?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return noStore({ error: "Add your name." }, 400);
  }

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const session = data.user ? { id: data.user.id, anonymous: Boolean(data.user.is_anonymous) } : null;
  const trap = typeof body.website === "string" && body.website.trim() !== "";

  try {
    return acceptReply(
      await createOpenPass(code, { name: body.name, contact: body.contact, timeZone: body.timeZone }, session, {
        ip: requestIp(request),
        trap,
        origin: mailOrigin(request),
      }),
    );
  } catch (error) {
    console.error("[events] open pass", error);
    return noStore({ error: "Could not open your pass." }, 500);
  }
}