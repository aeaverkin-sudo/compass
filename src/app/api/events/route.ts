import { NextResponse } from "next/server";
import { requireOwnerId } from "@/shared/services/attachment-api";
import { readEventForm } from "@/shared/event/read-event-form";
import { createEvent, listMyEvents } from "@/shared/services/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Events the signed-in user organises or has joined. */
export async function GET() {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ events: [] }, owner.status);
  try {
    const events = await listMyEvents(owner.id);
    return noStore({ events });
  } catch (error) {
    console.error("[events] list", error);
    return noStore({ error: "Could not load events." }, 500);
  }
}

/** Creates one event for the signed-in organiser. Nothing is public until the invite route. */
export async function POST(request: Request) {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ error: "Sign in to create an event." }, owner.status);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return noStore({ error: "Could not read the form" }, 400);
  }

  const parsed = readEventForm(form);
  if (!parsed.ok) return noStore({ error: parsed.error }, parsed.status);
  const fields = parsed.value;
  try {
    const created = await createEvent({
      ownerId: owner.id,
      name: fields.name,
      description: fields.description,
      date: fields.date,
      endsAt: fields.endsAt,
      place: fields.place,
      theme: fields.theme,
      layout: fields.layout,
      logo: fields.logo,
      isPaid: false,
      paymentUrl: null,
    });
    return noStore(created);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "logo_type") return noStore({ error: "Pic needs to be a PNG, JPG, WEBP, or SVG." }, 415);
    if (message === "logo_too_large") return noStore({ error: "Pic is over 8 MB." }, 413);
    console.error("[events] create", error);
    return noStore({ error: "Could not create the event." }, 500);
  }
}
