/**
 * Network sort "by Event", removed from the menu on 4 Nov 2026.
 * Contacts still store sourceEventId. This only grouped the book.
 * Not imported by the app.
 */

type Contact = {
  sourceEventId: string | null;
  createdAt: string;
};

export function groupContactsByEvent(contacts: Contact[]) {
  const groups = new Map<string, Contact[]>();
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
