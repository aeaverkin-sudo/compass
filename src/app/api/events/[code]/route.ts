import { NextResponse } from "next/server";
import { readEventForm } from "@/shared/event/read-event-form";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { loadEventInvite } from "@/shared/services/event-invite";
import { loadManageEvent } from "@/shared/services/event-manage";
import { updateEvent } from "@/shared/services/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ code: string }> };

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function once(value: string): string {
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}

/** Updates the invite. The public token and the short code stay. */
export async function PATCH(request: Request, context: RouteProps) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return noStore({ error: "Sign in to edit the event." }, 401);

  const { code } = await context.params;
  const lookup = once(code);
  const access = await loadManageEvent(lookup, data.user.id, "edit");
  if (access.kind !== "ok") return noStore({ error: "Not allowed." }, access.kind === "missing" ? 404 : 403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return noStore({ error: "Could not read the form" }, 400);
  }

  const parsed = readEventForm(form);
  if (!parsed.ok) return noStore({ error: parsed.error }, parsed.status);
  const fields = parsed.value;
  const invite = await loadEventInvite(lookup);

  try {
    await updateEvent({
      eventId: access.event.id,
      actorId: data.user.id,
      previousLogoId: invite?.logoAttachmentId ?? null,
      name: fields.name,
      description: fields.description,
      place: fields.place,
      date: fields.date,
      endsAt: fields.endsAt,
      theme: fields.theme,
      layout: fields.layout,
      logo: fields.logo,
      removeLogo: fields.removeLogo,
    });
    return noStore({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "logo_type") return noStore({ error: "Pic needs to be a PNG, JPG, WEBP, or SVG." }, 415);
    if (message === "logo_too_large") return noStore({ error: "Pic is over 8 MB." }, 413);
    console.error("[events] update", error);
    return noStore({ error: "Could not save the event." }, 500);
  }
}
