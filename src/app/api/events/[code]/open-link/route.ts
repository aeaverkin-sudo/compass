import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { loadManageEvent } from "@/shared/services/event-manage";
import { saveOpenLink } from "@/shared/services/event-open-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string }> };

const CAPACITY_MAX = 100000;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** The open link switch and the capacity. An empty capacity means no limit. */
export async function PATCH(request: Request, context: RouteProps) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user || data.user.is_anonymous) return noStore({ error: "Sign in." }, 401);
  const { code } = await context.params;
  let body: { on?: unknown; capacity?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return noStore({ error: "Bad request." }, 400);
  }
  const patch: { open?: boolean; capacity?: number | null } = {};
  if (typeof body.on === "boolean") patch.open = body.on;
  if (body.capacity === null) patch.capacity = null;
  else if (body.capacity !== undefined) {
    const capacity = Number(body.capacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > CAPACITY_MAX) {
      return noStore({ error: "Capacity is a whole number above zero." }, 400);
    }
    patch.capacity = capacity;
  }
  if (patch.open === undefined && patch.capacity === undefined) return noStore({ error: "Bad request." }, 400);

  const loaded = await loadManageEvent(code, data.user.id, "guests");
  if (loaded.kind === "missing") return noStore({ error: "Event not found" }, 404);
  if (loaded.kind !== "ok") return noStore({ error: "Not allowed." }, 403);
  if (!(await saveOpenLink(loaded.event.id, patch))) {
    return noStore({ error: "The open link needs the event cabinet migration." }, 409);
  }
  return noStore({ ok: true });
}
