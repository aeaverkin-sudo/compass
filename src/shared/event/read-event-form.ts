import { isEventLayout, isEventTheme, type EventLayoutId, type EventThemeId } from "@/shared/event/themes";
import { readEventDate } from "@/shared/services/events";

export type EventFormInput = {
  name: string;
  description: string | null;
  place: string | null;
  date: string | null;
  endsAt: string | null;
  theme: EventThemeId;
  layout: EventLayoutId;
  logo: File | null;
  removeLogo: boolean;
};

function textField(value: FormDataEntryValue | null, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

/** Shared checks for create and edit. Payment is not part of the form. */
export function readEventForm(
  form: FormData,
): { ok: true; value: EventFormInput } | { ok: false; status: number; error: string } {
  const name = textField(form.get("name"), 160);
  if (!name) return { ok: false, status: 400, error: "Add an event name." };

  const themeRaw = textField(form.get("theme"), 20);
  if (themeRaw && !isEventTheme(themeRaw)) return { ok: false, status: 400, error: "Unknown theme." };
  const layoutRaw = textField(form.get("layout"), 20);
  if (layoutRaw && !isEventLayout(layoutRaw)) return { ok: false, status: 400, error: "Unknown style." };

  const dateRaw = textField(form.get("date"), 40);
  const date = readEventDate(dateRaw);
  if (dateRaw && !date) return { ok: false, status: 400, error: "That date could not be read." };
  const endRaw = textField(form.get("end"), 40);
  const endsAt = readEventDate(endRaw);
  if (endRaw && !endsAt) return { ok: false, status: 400, error: "That date could not be read." };

  const logo = form.get("logo");
  return {
    ok: true,
    value: {
      name,
      description: textField(form.get("description"), 4000) || null,
      place: textField(form.get("place"), 240) || null,
      date,
      endsAt,
      theme: themeRaw && isEventTheme(themeRaw) ? themeRaw : "paper",
      layout: layoutRaw && isEventLayout(layoutRaw) ? layoutRaw : "grid",
      logo: logo instanceof File ? logo : null,
      removeLogo: form.get("remove_logo") === "1",
    },
  };
}
