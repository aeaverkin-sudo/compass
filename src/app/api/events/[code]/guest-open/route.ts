import { NextResponse } from "next/server";
import { loadEventInvite } from "@/shared/services/event-invite";
import { markGuestOpened } from "@/shared/services/event-guest-pass";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string }> };

/** The page script reports the open. A mail scanner fetching the link does not run it. */
export async function POST(request: Request, context: RouteProps) {
  const { code } = await context.params;
  let token: unknown = null;
  try {
    token = ((await request.json()) as { token?: unknown }).token;
  } catch {
    token = null;
  }
  const event = await loadEventInvite(code);
  if (event) {
    try {
      await markGuestOpened(event.id, token);
    } catch (error) {
      console.error("[events] guest open", error);
    }
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
