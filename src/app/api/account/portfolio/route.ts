import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { noStore } from "@/shared/services/guest-accept-reply";
import { createSiteAccount } from "@/shared/services/site-signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Site sign-up: the email and the password shown on the one screen. */
export async function POST(request: Request) {
  let body: { email?: unknown; password?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return noStore({ error: "Add your email." }, 400);
  }

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const session = data.user ? { id: data.user.id, anonymous: Boolean(data.user.is_anonymous) } : null;

  try {
    const result = await createSiteAccount(session, { email: body.email, password: body.password });
    if (!result.ok) return noStore({ error: result.error }, result.status);
    return noStore(result);
  } catch (error) {
    console.error("[account] signup", error instanceof Error ? error.message : error);
    return noStore({ error: "Could not create your profile." }, 500);
  }
}
