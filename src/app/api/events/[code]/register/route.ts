import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { GUEST_COOKIE } from "@/shared/services/event-guest-pass";
import { moveRegistrationCard } from "@/shared/services/event-registration";
import { loadEventInvite } from "@/shared/services/event-invite";
import { eventListStatus } from "@/shared/services/events";
import { isPermanentAccount, joinWithOwnCard } from "@/shared/services/guest-accept";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string }> };

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Only a registered account joins with its own card. A pass is made on the invite. */
async function permanentId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const session = { id: data.user.id, anonymous: Boolean(data.user.is_anonymous) };
  return (await isPermanentAccount(session)) ? session.id : null;
}

async function readCardId(request: Request): Promise<string> {
  try {
    const body = (await request.json()) as { cardId?: unknown };
    return typeof body.cardId === "string" ? body.cardId : "";
  } catch {
    return "";
  }
}

/** I'm going, or a tap on a portfolio: registers with that card, or the first one. */
export async function POST(request: Request, context: RouteProps) {
  const userId = await permanentId();
  if (!userId) return noStore({ error: "Sign in to join." }, 401);

  const { code } = await context.params;
  const event = await loadEventInvite(code);
  if (!event) return noStore({ error: "Event not found" }, 404);
  if (eventListStatus(event.date, Date.now(), event.endsAt) === "past") {
    return noStore({ error: "This event has ended" }, 410);
  }
  const cardId = await readCardId(request);

  try {
    const jar = await cookies();
    const guestToken = jar.get(GUEST_COOKIE)?.value ?? null;
    const joined = await joinWithOwnCard(userId, event, code, guestToken, cardId || null);
    if (!joined.ok) return noStore({ error: joined.error }, joined.status);
    if (guestToken) jar.delete(GUEST_COOKIE);
    return noStore({ joined: Boolean(joined.registrationId) });
  } catch (error) {
    console.error("[events] register", error);
    return noStore({ error: "Could not join." }, 500);
  }
}

/** Another card for the badge. The registration and its check-in link stay. */
export async function PATCH(request: Request, context: RouteProps) {
  const userId = await permanentId();
  if (!userId) return noStore({ error: "Sign in to join." }, 401);

  const { code } = await context.params;
  const cardId = await readCardId(request);
  if (!cardId) return noStore({ error: "Choose a portfolio." }, 400);

  try {
    const result = await moveRegistrationCard(userId, code, cardId);
    if (!result.ok) return noStore({ error: result.error }, result.status);
    return noStore({ cardId: result.registration.cardId });
  } catch (error) {
    console.error("[events] badge", error);
    return noStore({ error: "Could not save." }, 500);
  }
}
