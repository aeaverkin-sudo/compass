import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { mailOrigin } from "@/shared/lib/public-origin";
import { sendWelcomeMail } from "@/shared/services/signup";
import { noStore } from "@/shared/services/http-reply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The one welcome mail after Create portfolio on the site. */
export async function POST(request: Request) {
  let body: { cardId?: unknown; password?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return noStore({ error: "Bad request" }, 400);
  }
  const cardId = typeof body.cardId === "string" ? body.cardId : "";
  const password = typeof body.password === "string" ? body.password.slice(0, 128) : "";
  if (!UUID.test(cardId) || !password.trim()) return noStore({ error: "Bad request" }, 400);

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user || data.user.is_anonymous) return noStore({ error: "Sign in first." }, 401);

  try {
    return noStore({ sent: await sendWelcomeMail(data.user.id, cardId, password, mailOrigin(request)) });
  } catch (error) {
    console.error("[mail] welcome", error instanceof Error ? error.message : error);
    return noStore({ sent: false }, 500);
  }
}
