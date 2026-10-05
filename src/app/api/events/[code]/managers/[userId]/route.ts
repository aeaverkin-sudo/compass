import { NextResponse } from "next/server";
import { isUuid } from "@/shared/services/attachment-api";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { permissionsOf, removeManager, updateManagerPermissions } from "@/shared/services/event-manage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string; userId: string }> };

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function actorId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return data.user.id;
}

export async function PATCH(request: Request, context: RouteProps) {
  const userId = await actorId();
  if (!userId) return noStore({ error: "Sign in to change a manager." }, 401);
  const { code, userId: targetId } = await context.params;
  if (!isUuid(targetId)) return noStore({ error: "Manager not found" }, 404);

  let permissions = permissionsOf(null);
  try {
    const body = (await request.json()) as { permissions?: unknown };
    permissions = permissionsOf(body.permissions);
  } catch {
    return noStore({ error: "Choose a permission." }, 400);
  }

  try {
    const result = await updateManagerPermissions(code, userId, targetId, permissions);
    if (!result.ok) return noStore({ error: result.error }, result.status);
    return noStore({ ok: true });
  } catch (error) {
    console.error("[events] manager update", error);
    return noStore({ error: "Could not update the manager." }, 500);
  }
}

export async function DELETE(_request: Request, context: RouteProps) {
  const userId = await actorId();
  if (!userId) return noStore({ error: "Sign in to remove a manager." }, 401);
  const { code, userId: targetId } = await context.params;
  if (!isUuid(targetId)) return noStore({ error: "Manager not found" }, 404);

  try {
    const result = await removeManager(code, userId, targetId);
    if (!result.ok) return noStore({ error: result.error }, result.status);
    return noStore({ ok: true });
  } catch (error) {
    console.error("[events] manager remove", error);
    return noStore({ error: "Could not remove the manager." }, 500);
  }
}
