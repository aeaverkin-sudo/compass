import type { EventLayoutId, EventThemeId } from "@/shared/event/themes";

export type EventFormValues = {
  name: string;
  date: string;
  time: string;
  endTime: string;
  place: string;
  about: string;
  theme: EventThemeId;
  layout: EventLayoutId;
  themeTouched: boolean;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function clockFromIso(iso: string | null): { date: string; time: string } | null {
  if (!iso) return null;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  return {
    date: `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`,
    time: `${pad(when.getHours())}:${pad(when.getMinutes())}`,
  };
}

/** Local date and clock, the same pair Create sends back as ISO. */
export function fieldsFromEvent(input: {
  name: string;
  description: string | null;
  place: string | null;
  date: string | null;
  endsAt: string | null;
  theme: EventThemeId;
  layout: EventLayoutId;
}): EventFormValues {
  const start = clockFromIso(input.date);
  const end = clockFromIso(input.endsAt);
  return {
    name: input.name,
    date: start?.date ?? "",
    time: start?.time ?? "",
    endTime: end?.time ?? "",
    place: input.place ?? "",
    about: input.description ?? "",
    theme: input.theme,
    layout: input.layout,
    themeTouched: true,
  };
}

export function appendEventFields(body: FormData, values: EventFormValues, logo: File | null, removeLogo: boolean) {
  body.set("name", values.name.trim());
  body.set("description", values.about.trim());
  body.set("place", values.place.trim());
  body.set("theme", values.theme);
  body.set("layout", values.layout);
  if (values.date) {
    const when = new Date(`${values.date}T${values.time || "00:00"}`);
    if (!Number.isNaN(when.getTime())) body.set("date", when.toISOString());
  }
  if (values.date && values.endTime) {
    const end = new Date(`${values.date}T${values.endTime}`);
    if (!Number.isNaN(end.getTime())) body.set("end", end.toISOString());
  }
  if (logo) body.set("logo", logo);
  if (removeLogo) body.set("remove_logo", "1");
}
