/**
 * Data and the Events desk stay in the project. Both are closed for an ordinary account.
 * A later business account opens each one on its own:
 * dataDeskOpen for the report, eventsDeskOpen for the Events list and for creating an event.
 * Issued invites, passes, check-in, and an event that already exists do not use these.
 */
export function dataDeskOpen(): boolean {
  return false;
}

export function eventsDeskOpen(): boolean {
  return false;
}
