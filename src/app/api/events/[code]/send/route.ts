import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { publicOrigin } from "@/shared/lib/public-origin";
import { loadManageEvent } from "@/shared/services/event-manage";
import { eventMailsReady, loadMailEvent, sendInvites } from "@/shared/services/event-mails";
import { mailConfigured } from "@/shared/services/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteProps = { params: Promise<{ code: string }> };

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** SEND TO N: the invite to every guest with an email who has not had it, or to the ticked ones among them. */
export async function POST(request: Request, context: RouteProps) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user || data.user.is_anonymous) return noStore({ error: "Sign in." }, 401);
  const { code } = await context.params;
  const loaded = await loadManageEvent(code, data.user.id, "guests");
  if (loaded.kind === "missing") return noStore({ error: "Event not found" }, 404);
  if (loaded.kind !== "ok") return noStore({ error: "Not allowed." }, 403);
  if (!mailConfigured()) return noStore({ error: "Mail is not set up." }, 503);
  if (!(await eventMailsReady())) return noStore({ error: "Sending needs the event mails migration." }, 409);
  const event = await loadMailEvent(code);
  if (!event) return noStore({ error: "Event not found" }, 404);
  const body = (await request.json().catch(() => null)) as { guestIds?: unknown } | null;
  const only = Array.isArray(body?.guestIds)
    ? body.guestIds.filter((id): id is string => typeof id === "string").slice(0, 5000)
    : undefined;
  try {
    return noStore(await sendInvites(loaded.event.id, event, publicOrigin(request), only));
  } catch (error) {
    console.error("[events] send passes", error);
    return noStore({ error: "Could not send." }, 500);
  }
}
