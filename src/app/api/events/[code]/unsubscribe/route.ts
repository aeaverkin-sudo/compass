import { NextResponse } from "next/server";
import { loadEventInvite } from "@/shared/services/event-invite";
import { unsubscribeGuest } from "@/shared/services/event-mails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string }> };

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * The Unsubscribe button, and the One-Click post Gmail and Apple Mail send to the
 * List-Unsubscribe address. The token is in the address; a JSON body may carry it too.
 */
export async function POST(request: Request, context: RouteProps) {
  const { code } = await context.params;
  let token: unknown = new URL(request.url).searchParams.get("g");
  if (!token && request.headers.get("content-type")?.includes("application/json")) {
    try {
      token = ((await request.json()) as { token?: unknown }).token;
    } catch {
      token = null;
    }
  }
  const event = await loadEventInvite(code);
  if (!event) return noStore({ error: "Event not found" }, 404);
  try {
    if (!(await unsubscribeGuest(event.id, token))) return noStore({ error: "This link is not valid." }, 404);
  } catch (error) {
    console.error("[mail] unsubscribe", error);
    return noStore({ error: "Could not unsubscribe." }, 500);
  }
  return noStore({ ok: true });
}
