/**
 * Parked Network sort. Contacts were grouped by the event that was happening
 * when they were saved (`sourceEventId` from `saveConnection`).
 * A group with an event was labelled "Event", with no event name.
 * A contact saved with no event sat in a group with an empty label.
 * `source_event_id` stays in the database. Bring this back when the label is the event's name.
 */

type SavedAtEvent = {
  sourceEventId: string | null;
  createdAt: string;
};

export function groupByEvent<T extends SavedAtEvent>(contacts: T[]) {
  const groups = new Map<string, T[]>();
  for (const contact of contacts) {
    const key = contact.sourceEventId ?? "";
    const list = groups.get(key) ?? [];
    list.push(contact);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([key, list]) => ({
    key,
    label: key ? "Event" : "",
    contacts: list.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  }));
}
