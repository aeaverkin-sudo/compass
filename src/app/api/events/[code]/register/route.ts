import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { registerForEvent, saveRegistrationConsent } from "@/shared/services/event-registration";
import { loadEventInvite } from "@/shared/services/event-invite";
import { eventListStatus } from "@/shared/services/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string }> };

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** A session may join with its own card. A trial session counts. No session does not. */
async function signedInId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return data.user.id;
}

function flag(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export async function POST(request: Request, context: RouteProps) {
  const userId = await signedInId();
  if (!userId) return noStore({ error: "Sign in to join." }, 401);

  const { code } = await context.params;
  const event = await loadEventInvite(code);
  if (event && eventListStatus(event.date, Date.now(), event.endsAt) === "past") {
    return noStore({ error: "This event has ended" }, 410);
  }
  let cardId = "";
  let consentAnalytics = false;
  let consentConnections = false;
  try {
    const body = (await request.json()) as {
      cardId?: unknown;
      consentAnalytics?: unknown;
      consentConnections?: unknown;
    };
    cardId = typeof body.cardId === "string" ? body.cardId : "";
    consentAnalytics = body.consentAnalytics === true;
    consentConnections = body.consentConnections === true;
  } catch {
    return noStore({ error: "Choose a portfolio." }, 400);
  }

  try {
    const result = await registerForEvent(userId, code, cardId, {
      analytics: consentAnalytics,
      connections: consentConnections,
    });
    if (!result.ok) return noStore({ error: result.error }, result.status);
    return noStore({
      regToken: result.registration.regToken,
      cardId: result.registration.cardId,
      consentAnalytics: result.registration.consentAnalytics,
      consentConnections: result.registration.consentConnections,
    });
  } catch (error) {
    console.error("[events] register", error);
    return noStore({ error: "Could not join." }, 500);
  }
}

export async function PATCH(request: Request, context: RouteProps) {
  const userId = await signedInId();
  if (!userId) return noStore({ error: "Sign in to join." }, 401);

  const { code } = await context.params;
  let analytics: boolean | null = null;
  let connections: boolean | null = null;
  try {
    const body = (await request.json()) as { analytics?: unknown; connections?: unknown };
    analytics = flag(body.analytics);
    connections = flag(body.connections);
  } catch {
    analytics = null;
  }
  if (analytics === null || connections === null) {
    return noStore({ error: "Choose both answers." }, 400);
  }

  try {
    const result = await saveRegistrationConsent(userId, code, { analytics, connections });
    if (!result.ok) return noStore({ error: result.error }, result.status);
    return noStore({
      consentAnalytics: result.registration.consentAnalytics,
      consentConnections: result.registration.consentConnections,
    });
  } catch (error) {
    console.error("[events] consent", error);
    return noStore({ error: "Could not save." }, 500);
  }
}
