import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { createOpenPass } from "@/shared/services/guest-accept";
import { acceptReply, noStore } from "@/shared/services/guest-accept-reply";
import { requestIp } from "@/shared/services/event-pass-guard";
import { publicOrigin } from "@/shared/lib/public-origin";
import { pkpassResponseHeaders, walletConfigured } from "@/shared/services/wallet-pass";
import { buildEventPass } from "@/shared/services/wallet-passes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string }> };

/** A sign-in link goes out by mail. The site address comes first, never a request header alone. */
function mailOrigin(request: Request): string {
  const canonical = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (canonical && /^https?:\/\//i.test(canonical)) return canonical;
  return publicOrigin(request);
}

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

/** My event badge for Apple Wallet. Only a signed-in account with a registration gets it. */
export async function GET(request: Request, context: RouteProps) {
  if (!walletConfigured()) return noStore({ error: "wallet_not_configured" }, 503);
  const { code } = await context.params;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return noStore({ error: "Unauthorized" }, 401);

  try {
    const pass = await buildEventPass(code, data.user.id, publicOrigin(request));
    if (!pass) return noStore({ error: "No pass for this event." }, 404);
    return new NextResponse(new Uint8Array(pass.file), { headers: pkpassResponseHeaders(pass.name) });
  } catch (error) {
    console.error("[wallet] event", error instanceof Error ? error.message : error);
    return noStore({ error: "Could not make the pass." }, 500);
  }
}
