import { NextResponse } from "next/server";
import { requireOwnerId } from "@/shared/services/attachment-api";
import { isEventLayout, isEventTheme } from "@/shared/event/themes";
import { createEvent, readEventDate } from "@/shared/services/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function textField(value: FormDataEntryValue | null, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
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

  const name = textField(form.get("name"), 160);
  if (!name) return noStore({ error: "Add an event name." }, 400);

  const themeRaw = textField(form.get("theme"), 20);
  if (themeRaw && !isEventTheme(themeRaw)) return noStore({ error: "Unknown theme." }, 400);
  const layoutRaw = textField(form.get("layout"), 20);
  if (layoutRaw && !isEventLayout(layoutRaw)) return noStore({ error: "Unknown style." }, 400);

  const dateRaw = textField(form.get("date"), 40);
  const date = readEventDate(dateRaw);
  if (dateRaw && !date) return noStore({ error: "That date could not be read." }, 400);

  const logo = form.get("logo");
  try {
    const created = await createEvent({
      ownerId: owner.id,
      name,
      description: textField(form.get("description"), 4000) || null,
      date,
      place: textField(form.get("place"), 240) || null,
      theme: themeRaw && isEventTheme(themeRaw) ? themeRaw : "paper",
      layout: layoutRaw && isEventLayout(layoutRaw) ? layoutRaw : "grid",
      logo: logo instanceof File ? logo : null,
    });
    return noStore(created);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "logo_type") return noStore({ error: "Logo needs to be a PNG, JPG, WEBP, or SVG." }, 415);
    if (message === "logo_too_large") return noStore({ error: "Logo is over 8 MB." }, 413);
    console.error("[events] create", error);
    return noStore({ error: "Could not create the event." }, 500);
  }
}
