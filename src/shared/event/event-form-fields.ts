import type { EventLayoutId, EventThemeId } from "@/shared/event/themes";
import { readInviteRows, type InviteLogoLook, type InviteRow } from "@/shared/event/invite-rows";
import { inviteDateText, inviteTimeText } from "@/shared/event/invite-when";
import { eventTimeZone, zonedIso, zonedParts } from "@/shared/event/time-zone";

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
  /** Renamed zone labels and the organiser's own rows. Base values stay in their own fields. */
  inviteRows: InviteRow[];
  logoLook: InviteLogoLook | null;
  /** Date and time as typed. Parsed into date, time and endTime. */
  dateText: string;
  timeText: string;
  /** IANA zone the date and clocks are typed in. */
  timeZone: string;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function clockFromIso(iso: string | null, timeZone: string): { date: string; time: string } | null {
  if (!iso) return null;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  const p = zonedParts(when, timeZone);
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}

/** The start as ISO, read in the event's zone. */
export function formStartIso(values: Pick<EventFormValues, "date" | "time" | "timeZone">): string | null {
  return values.date ? zonedIso(values.date, values.time || "00:00", values.timeZone) : null;
}

/** The end as ISO. An end clock at or before the start is the next morning. */
export function formEndIso(values: Pick<EventFormValues, "date" | "time" | "endTime" | "timeZone">): string | null {
  if (!values.date || !values.endTime) return null;
  const nextDay = values.endTime <= (values.time || "00:00") ? 1 : 0;
  return zonedIso(values.date, values.endTime, values.timeZone, nextDay);
}

/** The event's date and clock in its own zone, the same pair Create sends back as ISO. */
export function fieldsFromEvent(input: {
  name: string;
  description: string | null;
  place: string | null;
  date: string | null;
  endsAt: string | null;
  timeZone?: string | null;
  theme: EventThemeId;
  layout: EventLayoutId;
  inviteRows?: InviteRow[] | null;
  logoLook?: InviteLogoLook | null;
}): EventFormValues {
  const timeZone = eventTimeZone(input.timeZone);
  const start = clockFromIso(input.date, timeZone);
  const end = clockFromIso(input.endsAt, timeZone);
  const date = start?.date ?? "";
  const time = start?.time ?? "";
  const endTime = end?.time ?? "";
  return {
    name: input.name,
    date,
    time,
    endTime,
    place: input.place ?? "",
    about: input.description ?? "",
    theme: input.theme,
    layout: input.layout,
    themeTouched: true,
    inviteRows: readInviteRows(input.inviteRows),
    logoLook: input.logoLook ?? null,
    dateText: inviteDateText(date),
    timeText: inviteTimeText(time, endTime),
    timeZone,
  };
}

export function appendEventFields(body: FormData, values: EventFormValues, logo: File | null, removeLogo: boolean) {
  body.set("name", values.name.trim());
  body.set("description", values.about.trim());
  body.set("place", values.place.trim());
  body.set("theme", values.theme);
  body.set("layout", values.layout);
  body.set("time_zone", eventTimeZone(values.timeZone));
  const start = formStartIso(values);
  if (start) body.set("date", start);
  const end = formEndIso(values);
  if (end) body.set("end", end);
  body.set("invite_rows", JSON.stringify(readInviteRows(values.inviteRows, true)));
  body.set("logo_look", values.logoLook ?? "");
  if (logo) body.set("logo", logo);
  if (removeLogo) body.set("remove_logo", "1");
}
