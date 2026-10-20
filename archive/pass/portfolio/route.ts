import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { createColdEntryAccount } from "@/shared/services/cold-entry";
import { noStore } from "@/shared/services/http-reply";
import { requestIp } from "@/shared/services/event-pass-guard";
import { mailOrigin } from "@/shared/lib/public-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string }> };

/** Create my profile on the open link: the email and the password on the screen. */
export async function POST(request: Request, context: RouteProps) {
  const { code } = await context.params;
  let body: { email?: unknown; password?: unknown; website?: unknown; guestToken?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return noStore({ error: "Add your email." }, 400);
  }

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const session = data.user ? { id: data.user.id, anonymous: Boolean(data.user.is_anonymous) } : null;
  const trap = typeof body.website === "string" && body.website.trim() !== "";

  try {
    const result = await createColdEntryAccount(
      code,
      { email: body.email, password: body.password, guestToken: body.guestToken },
      session,
      { ip: requestIp(request), trap, origin: mailOrigin(request) },
    );
    if (!result.ok) return noStore({ error: result.error }, result.status);
    return noStore(result);
  } catch (error) {
    console.error("[events] cold entry", error instanceof Error ? error.message : error);
    return noStore({ error: "Could not create your profile." }, 500);
  }
}
