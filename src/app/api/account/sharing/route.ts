import { NextResponse } from "next/server";
import { requireOwnerId } from "@/shared/services/attachment-api";
import { saveSharingConsent } from "@/shared/services/event-registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Share anonymous analytics and Allow connections: account settings, applied to every registration. */
export async function POST(request: Request) {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ error: owner.error }, owner.status);
  let analytics: unknown = null;
  let connections: unknown = null;
  try {
    const body = (await request.json()) as { analytics?: unknown; connections?: unknown };
    analytics = body.analytics;
    connections = body.connections;
  } catch {
    analytics = null;
  }
  if (typeof analytics !== "boolean" || typeof connections !== "boolean") {
    return noStore({ error: "Choose both answers." }, 400);
  }
  try {
    await saveSharingConsent(owner.id, { analytics, connections });
    return noStore({ analytics, connections });
  } catch (error) {
    console.error("[account] sharing", error);
    return noStore({ error: "Could not save." }, 500);
  }
}
