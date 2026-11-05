import { NextResponse } from "next/server";
import { sessionUser } from "@/shared/lib/supabase/session-user";
import { deleteGuestList, updateGuestList } from "@/shared/services/event-guest-lists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string; listId: string }> };

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, context: RouteProps) {
  const user = await sessionUser();
  if (!user) return noStore({ error: "Sign in first." }, 401);
  const { code, listId } = await context.params;
  let body: { name?: unknown; isPaid?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return noStore({ error: "Bad request" }, 400);
  }
  try {
    const result = await updateGuestList(code, user.id, listId, {
      name: typeof body.name === "string" ? body.name : undefined,
      isPaid: typeof body.isPaid === "boolean" ? body.isPaid : undefined,
    });
    if (!result.ok) return noStore({ error: result.error }, result.status);
    return noStore({ ok: true });
  } catch (error) {
    console.error("[events] guest list update", error);
    return noStore({ error: "Could not save the list." }, 500);
  }
}

export async function DELETE(_request: Request, context: RouteProps) {
  const user = await sessionUser();
  if (!user) return noStore({ error: "Sign in first." }, 401);
  const { code, listId } = await context.params;
  try {
    const result = await deleteGuestList(code, user.id, listId);
    if (!result.ok) return noStore({ error: result.error }, result.status);
    return noStore({ ok: true });
  } catch (error) {
    console.error("[events] guest list delete", error);
    return noStore({ error: "Could not delete the list." }, 500);
  }
}
