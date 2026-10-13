import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { loadManageEvent } from "@/shared/services/event-manage";
import { saveShowGoing } from "@/shared/services/event-going";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string }> };

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** The organiser's switch: guests see who's going, or not. */
export async function PATCH(request: Request, context: RouteProps) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user || data.user.is_anonymous) return noStore({ error: "Sign in." }, 401);
  const { code } = await context.params;
  let on: unknown;
  try {
    on = ((await request.json()) as { on?: unknown }).on;
  } catch {
    on = undefined;
  }
  if (typeof on !== "boolean") return noStore({ error: "Bad request." }, 400);

  const loaded = await loadManageEvent(code, data.user.id, "guests");
  if (loaded.kind === "missing") return noStore({ error: "Event not found" }, 404);
  if (loaded.kind !== "ok") return noStore({ error: "Not allowed." }, 403);
  if (!(await saveShowGoing(loaded.event.id, on))) return noStore({ error: "Could not save." }, 503);
  return noStore({ on });
}
